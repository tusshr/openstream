export interface ApiMeta {
  requestId: string;
  timestamp: string;
  apiVersion: string;
}

export type ApiLinks = {
  self: string;
  [key: string]: string;
};

export interface Pagination {
  hasMore: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
  limit: number;
  totalCount?: number;
}

export interface ErrorDetail {
  field?: string;
  rule?: string;
  message: string;
  rejectedValue?: unknown;
}

export interface ApiError {
  code: string;
  message: string;
  details: ErrorDetail[];
  helpUrl?: string;
}

export interface ApiSuccessResponse<T> {
  status: "success";
  data: T;
  meta: ApiMeta;
  links?: ApiLinks;
}

export interface ApiCollectionResponse<T> {
  status: "success";
  data: T[];
  pagination: Pagination;
  links: ApiLinks;
  meta: ApiMeta;
}

export interface ApiErrorResponse {
  status: "error";
  error: ApiError;
  meta: ApiMeta;
}

export interface ApiAcceptedResponse<T> {
  status: "accepted";
  data: T;
  meta: ApiMeta;
}
