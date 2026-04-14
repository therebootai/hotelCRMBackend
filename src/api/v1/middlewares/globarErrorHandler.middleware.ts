import type { NextFunction, Request, Response } from "express";
import { type tHttpError } from "@/api/v1/interfaces/http";

export const globalErrorHandler = (
  err: tHttpError,
  _: Request,
  res: Response,
  __: NextFunction,
) => {
  let statusCode = (err as tHttpError).statusCode || 500;
  err.message = err.message || "Internal Server Error";

  return res.status(statusCode).json(err);
};
