export interface BaseResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}

export type PagedPayload<T> =
  | T[]
  | {
      items?: T[];
      content?: T[];
      data?: T[];
      result?: T[];
      list?: T[];
      page?: number;
      pageNumber?: number;
      totalPages?: number;
      hasNext?: boolean;
      totalElements?: number;
    };
