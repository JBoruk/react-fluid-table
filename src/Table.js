import React, {
  useRef,
  useContext,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect
} from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList } from "react-window";
import PropTypes from "prop-types";
import Header from "./Header";
import RowWrapper from "./RowWrapper";
import { TableContextProvider, TableContext } from "./TableContext";
import { randomString, findRowByUuidAndKey } from "./util";
import { calculateColumnWidth } from "./useCellResize";

const DEFAULT_ROW_HEIGHT = 37;
const NO_COMPONENT = { offsetHeight: 0 };
const NO_PARENT = {
  parentElement: { scrollWidth: 0, clientWidth: 0 }
};

/**
 * We add 1 to the itemCount to account for the header 'row'
 */
const ListComponent = ({
  className,
  height,
  width,
  rowCount,
  itemKey,
  rowHeight,
  data,
  metaData,
  subComponent,
  defaultRowHeight
}) => {
  // hooks
  const listRef = useRef(null);
  const tableRef = useRef(null);
  const resizeRef = useRef(null);
  const timeoutRef = useRef(null);
  const pixelWidthRef = useRef(null);
  const resetIndexRef = useRef(Infinity);
  const tableContext = useContext(TableContext);
  const [useRowWidth, setUseRowWidth] = useState(true);
  const [pixelWidth, setPixelWidth] = useState(0);

  // variables
  const defaultSize = defaultRowHeight || DEFAULT_ROW_HEIGHT;
  const { uuid, expanded, minColumnWidth, fixedWidth, remainingCols } = tableContext.state;

  // functions
  const generateKeyFromRow = useCallback(
    (row, defaultValue) => {
      const generatedKey = itemKey ? itemKey(row) : undefined;
      return generatedKey !== undefined ? generatedKey : defaultValue;
    },
    [itemKey]
  );

  const clearSizeCache = useCallback(
    (dataIndex, forceUpdate = false) => {
      if (!listRef.current) {
        return;
      }

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      const index = dataIndex + 1;
      if (forceUpdate) {
        listRef.current.resetAfterIndex(index);
        return;
      }

      resetIndexRef.current = Math.min(index, resetIndexRef.current);
      timeoutRef.current = window.setTimeout(() => {
        const resetNumber = resetIndexRef.current;
        resetIndexRef.current = Infinity;
        listRef.current.resetAfterIndex(resetNumber);
      }, 50);
    },
    [listRef, timeoutRef, resetIndexRef]
  );

  const calculateHeight = useCallback(
    (queryParam, optionalDataIndex = null) => {
      const dataIndex = typeof queryParam === "number" ? queryParam : optionalDataIndex;
      const key = generateKeyFromRow(data[dataIndex], dataIndex);
      const row = typeof queryParam === "number" ? findRowByUuidAndKey(uuid, key) : queryParam;

      if (!row) {
        return rowHeight || defaultSize;
      }

      const isExpanded = expanded[key];
      const rowComponent = row.children[0] || NO_COMPONENT;
      const subComponent = isExpanded ? row.children[1] : NO_COMPONENT;

      return (rowHeight || rowComponent.offsetHeight) + subComponent.offsetHeight;
    },
    [uuid, data, rowHeight, expanded, defaultSize, generateKeyFromRow]
  );

  const pixelWidthHelper = useCallback(() => {
    const [val] = calculateColumnWidth(tableRef.current, remainingCols, fixedWidth);
    const width = Math.max(val, minColumnWidth);
    if (width !== pixelWidth) {
      setPixelWidth(width);
    }
  }, [tableRef, remainingCols, fixedWidth, minColumnWidth, pixelWidth]);

  const shouldUseRowWidth = useCallback(() => {
    if (resizeRef.current) {
      window.clearTimeout(resizeRef.current);
    }

    resizeRef.current = window.setTimeout(() => {
      const { parentElement } = tableRef.current || NO_PARENT;
      setUseRowWidth(parentElement.scrollWidth <= parentElement.clientWidth);
    }, 50);
  }, [resizeRef, uuid, tableRef]);

  const calculatePixelWidth = useCallback(() => {
    if (pixelWidthRef.current) {
      window.clearTimeout(pixelWidthRef.current);
    }

    pixelWidthRef.current = window.setTimeout(pixelWidthHelper, 50);
  }, [pixelWidthRef, pixelWidthHelper]);

  // effects
  useLayoutEffect(() => {
    listRef.current.resetAfterIndex(0);
  }, [listRef]);

  useLayoutEffect(() => {
    if (tableRef.current) {
      pixelWidthHelper();
    }
  }, [pixelWidth, pixelWidthHelper]);

  useEffect(() => {
    if (!tableRef.current) {
      setUseRowWidth(tableRef.current.scrollWidth <= tableRef.current.clientWidth);
    }
  }, [tableRef]);

  useEffect(() => {
    window.addEventListener("resize", shouldUseRowWidth);
    return () => {
      if (resizeRef.current) {
        window.clearTimeout(resizeRef.current);
      }
      window.removeEventListener("resize", shouldUseRowWidth);
    };
  }, [shouldUseRowWidth, resizeRef]);

  useEffect(() => {
    window.addEventListener("resize", calculatePixelWidth);
    return () => {
      if (pixelWidthRef.current) {
        window.clearTimeout(pixelWidthRef.current);
      }
      window.removeEventListener("resize", calculatePixelWidth);
    };
  }, [calculatePixelWidth, pixelWidthRef]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [timeoutRef]);

  return (
    <VariableSizeList
      useIsScrolling
      className={`react-fluid-table ${className || ""}`}
      ref={listRef}
      innerRef={tableRef}
      innerElementType={Header}
      height={height}
      width={width}
      itemKey={(index, data) => {
        if (!index) return `${uuid}-header`;
        const dataIndex = index - 1;
        const row = data.rows[dataIndex];
        return generateKeyFromRow(row, index);
      }}
      itemCount={rowCount + 1}
      itemSize={index => (!index ? 32 : calculateHeight(index - 1))}
      itemData={{
        ...metaData,
        rows: data,
        rowHeight,
        pixelWidth,
        useRowWidth,
        subComponent,
        clearSizeCache,
        calculateHeight,
        generateKeyFromRow
      }}
    >
      {RowWrapper}
    </VariableSizeList>
  );
};

const Table = ({
  id,
  columns,
  minColumnWidth,
  onSort,
  sortColumn,
  sortDirection,
  tableHeight,
  tableWidth,
  ...rest
}) => {
  // TODO: do all prop validation here
  const disableHeight = tableHeight !== undefined;
  const disableWidth = tableWidth !== undefined;
  const [uuid] = useState(`${id || "data-table"}-${randomString()}`);

  return (
    <TableContextProvider
      initialState={{
        id,
        uuid,
        columns,
        minColumnWidth,
        onSort,
        sortColumn,
        sortDirection
      }}
    >
      {disableHeight === true && disableWidth === true ? (
        <ListComponent height={tableHeight} width={tableWidth} {...rest} />
      ) : (
        <AutoSizer disableHeight={disableHeight} disableWidth={disableWidth}>
          {({ height, width }) => (
            <ListComponent height={tableHeight || height} width={tableWidth || width} {...rest} />
          )}
        </AutoSizer>
      )}
    </TableContextProvider>
  );
};

ListComponent.propTypes = {
  className: PropTypes.string,
  height: PropTypes.number,
  width: PropTypes.number,
  rowCount: PropTypes.number,
  itemKey: PropTypes.func,
  rowHeight: PropTypes.number,
  data: PropTypes.array,
  metaData: PropTypes.object,
  subComponent: PropTypes.elementType
};

Table.propTypes = {
  id: PropTypes.string,
  headerHeight: PropTypes.number,
  minColumnWidth: PropTypes.number,
  tableHeight: PropTypes.number.isRequired,
  tableWidth: PropTypes.number,
  defaultRowHeight: PropTypes.number,
  subComponent: PropTypes.elementType,
  metaData: PropTypes.object,
  columns: PropTypes.array,
  onSort: PropTypes.func,
  sortColumn: PropTypes.string,
  sortDirection: PropTypes.string
};

Table.defaultProps = {
  headerHeight: 32,
  minColumnWidth: 80,
  metaData: {},
  rowStyles: {}
};

ListComponent.defaultProps = {
  height: 37
};

export default Table;
