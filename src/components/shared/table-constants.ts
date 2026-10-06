// Plain values shared by the server-rendered DataTable and the browser-side
// DataTableFrame. They live here, not in a "use client" file: a server
// component importing a value from a client module gets a reference
// placeholder, not the value (that broke every server-paged table).

/** Rows per page by default, and the body height the frame is sized for. */
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50];

/**
 * The scroll frame's height on tablet and desktop: about DEFAULT_PAGE_SIZE
 * rows plus the pinned header. Bigger pages scroll inside it.
 */
export const TABLE_FRAME_HEIGHT = "md:max-h-[31rem]";
