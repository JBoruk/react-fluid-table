import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { VariableSizeList } from "react-window";
import { ColumnProps, Generic, ListProps, TableProps, Text } from "../index";
import AutoSizer from "./AutoSizer";
import Header from "./Header";
import RowWrapper from "./RowWrapper";
import { TableContext, TableContextProvider } from "./TableContext";
import { arraysMatch, findHeaderByUuid, findRowByUuidAndKey, randomString } from "./util";

interface Data {
  rows: Generic[];
  [key: string]: any;
}

// constants
const DEFAULT_ROW_HEIGHT = 37;
const DEFAULT_HEADER_HEIGHT = 32;
const NO_NODE = { scrollWidth: 0, clientWidth: 0 };

// functions
const guessTableHeight = (rowHeight?: number, estimatedRowHeight?: number) => {
  const height = Math.max(rowHeight || estimatedRowHeight || DEFAULT_ROW_HEIGHT, 10);
  return height * 10 + DEFAULT_HEADER_HEIGHT;
};

const calculateColumnWidths = (
  element: HTMLElement | null,
  numColumns: number,
  fixedColumnWidths: number,
  minColumnWidth: number,
  columns: ColumnProps[]
): number[] => {
  if (!element) return columns.map(() => minColumnWidth);
  const offsetWidth = element.offsetWidth;
  let n = Math.max(numColumns, 1);
  let usedSpace = fixedColumnWidths;
  let freeSpace = Math.max(offsetWidth - usedSpace, 0);
  let width = Math.max(minColumnWidth, Math.floor(freeSpace / n));

  return columns.map((c: ColumnProps) => {
    if (c.width) {
      return c.width;
    }

    if (c.maxWidth) {
      const diff = width - c.maxWidth;
      if (diff > 0) {
        n = Math.max(n - 1, 1);
        usedSpace += c.maxWidth;
        freeSpace = Math.max(offsetWidth - usedSpace, 0);
        width = Math.max(minColumnWidth, Math.floor(freeSpace / n));
        return c.maxWidth;
      }
    }

    if (c.minWidth) {
      const diff = c.minWidth - width;
      if (diff > 0) {
        n = Math.max(n - 1, 1);
        usedSpace += c.minWidth;
        freeSpace = Math.max(offsetWidth - usedSpace, 0);
        width = Math.max(minColumnWidth, Math.floor(freeSpace / n));
        return c.minWidth;
      }
    }
    return width;
  });
};

/**
 * The main table component
 */
const ListComponent = ({
  data,
  width,
  height,
  itemKey,
  rowHeight,
  className,
  subComponent,
  estimatedRowHeight
}: ListProps) => {
  // hooks
  const timeoutRef = useRef(0);
  const listRef = useRef<any>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const tableContext = useContext(TableContext);
  const [useRowWidth, setUseRowWidth] = useState(true);

  // variables
  const { dispatch } = tableContext;
  const defaultSize = rowHeight || estimatedRowHeight;
  const {
    uuid,
    columns,
    minColumnWidth,
    fixedWidth,
    remainingCols,
    pixelWidths
  } = tableContext.state;

  // functions
  const generateKeyFromRow = useCallback(
    (row: Generic, defaultValue: number): Text => {
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

      window.clearTimeout(timeoutRef.current);
      if (forceUpdate) {
        listRef.current.resetAfterIndex(dataIndex + 1);
        return;
      }

      timeoutRef.current = window.setTimeout(() => {
        const node = tableRef.current?.children[1].children[0] as HTMLElement;
        const resetIndex = parseInt(node?.dataset.index || "0") + 1;
        listRef.current.resetAfterIndex(resetIndex);
      }, 50);
    },
    [listRef, tableRef, timeoutRef]
  );

  const calculateHeight = useCallback(
    (queryParam, optionalDataIndex = null) => {
      const dataIndex = typeof queryParam === "number" ? queryParam : optionalDataIndex;
      const key = generateKeyFromRow(data[dataIndex], dataIndex);
      const row = typeof queryParam === "number" ? findRowByUuidAndKey(uuid, key) : queryParam;

      if (!row) {
        if (!listRef.current) {
          return defaultSize;
        }

        const cachedSize = listRef.current._instanceProps.itemMetadataMap[dataIndex + 1] || {
          size: defaultSize
        };
        return cachedSize.size || defaultSize;
      }

      const arr = rowHeight ? [...row.children].slice(1) : [...row.children];
      return (rowHeight || 0) + arr.reduce((pv, c) => pv + c.offsetHeight, 0);
    },
    [uuid, data, listRef, rowHeight, defaultSize, generateKeyFromRow]
  );

  const updatePixelWidths = useCallback(() => {
    const widths = calculateColumnWidths(
      tableRef.current,
      remainingCols,
      fixedWidth,
      minColumnWidth,
      columns
    );
    if (!arraysMatch(widths, pixelWidths)) {
      dispatch({ type: "updatePixelWidths", widths });
    }
  }, [dispatch, remainingCols, fixedWidth, minColumnWidth, pixelWidths, columns]);

  const shouldUseRowWidth = useCallback(() => {
    const parentElement = tableRef.current?.parentElement || NO_NODE;
    setUseRowWidth(parentElement.scrollWidth <= parentElement.clientWidth);
  }, [tableRef]);

  // effects
  /* initializers */
  // initialize whether or not to use rowWidth (useful for bottom border)
  useEffect(() => {
    const widths = tableRef.current || NO_NODE;
    setUseRowWidth(widths.scrollWidth <= widths.clientWidth);
  }, []);

  // figure out how to wait for scrollbar to appear
  // before recalculating. using 100ms heuristic
  useEffect(() => {
    setTimeout(() => {
      updatePixelWidths();
      shouldUseRowWidth();
    }, 100);
  }, []);

  /* updates */
  // update pixel widths every time the width changes
  useLayoutEffect(updatePixelWidths, [width]);

  // check if we should use the row width when width changes
  useEffect(shouldUseRowWidth, [width]);

  /* cleanup */
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [timeoutRef]);

  return (
    <VariableSizeList
      className={`react-fluid-table ${className || ""}`}
      ref={listRef}
      innerRef={tableRef}
      innerElementType={Header}
      height={height}
      width={width}
      itemCount={data.length + 1}
      itemKey={(index: number, data: Data): Text => {
        if (!index) return `${uuid}-header`;
        const dataIndex = index - 1;
        const row = data.rows[dataIndex];
        return generateKeyFromRow(row, index);
      }}
      itemSize={index => {
        if (!index) {
          const header = findHeaderByUuid(uuid);
          return header ? (header.children[0] as HTMLElement).offsetHeight : DEFAULT_HEADER_HEIGHT;
        }

        return calculateHeight(index - 1);
      }}
      itemData={{
        rows: data,
        rowHeight,
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
}: TableProps) => {
  // TODO: do all prop validation here
  const disableHeight = tableHeight !== undefined;
  const disableWidth = tableWidth !== undefined;
  const { rowHeight, estimatedRowHeight } = rest;
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
      {typeof tableHeight === "number" && typeof tableWidth === "number" ? (
        <ListComponent height={tableHeight} width={tableWidth} {...rest} />
      ) : (
        <AutoSizer disableHeight={disableHeight} disableWidth={disableWidth}>
          {({ height, width }) => (
            <ListComponent
              width={tableWidth || width}
              height={tableHeight || height || guessTableHeight(rowHeight, estimatedRowHeight)}
              {...rest}
            />
          )}
        </AutoSizer>
      )}
    </TableContextProvider>
  );
};

Table.defaultProps = {
  minColumnWidth: 80,
  estimatedRowHeight: DEFAULT_ROW_HEIGHT
};

export default Table;
