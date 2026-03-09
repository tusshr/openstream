export interface PaginationMeta {
  hasMore: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
  limit: number;
  totalCount?: number;
}

export interface PaginationLinks {
  self: string;
  next?: string;
  prev?: string;
}

export interface FieldError {
  field?: string;
  rule?: string;
  message: string;
  rejectedValue?: unknown;
}

export interface ApiError {
  code: string;
  message: string;
  details?: FieldError[];
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
  links?: PaginationLinks;
}

export interface ApiErrorResponse {
  error: ApiError;
}
