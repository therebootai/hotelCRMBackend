import { type NextFunction, type Request } from "express";
import { type tHttpError } from "@/api/v1/interfaces/http";
import { EApplicationEnvironment, responseMessage } from "@/constant";
import env from "@/config/env";

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
const errorObject = (
  err: Error | unknown,
  req: Request,
  errorStatusCode: number = 500,
): tHttpError => {
  const errorObject: tHttpError = {
    success: false,
    statusCode: errorStatusCode,
    request: {
      ip: req.ip || null,
      method: req.method,
      url: req.originalUrl,
    },
    message:
      err instanceof Error
        ? err.message || responseMessage.SOMETHING_WENT_WRONG
        : responseMessage.SOMETHING_WENT_WRONG,
    data: null,
    trace: err instanceof Error ? { error: err.stack } : null,
  };

  //production environment check
  if (env.ENV === EApplicationEnvironment.PRODUCTION) {
    delete errorObject.request.ip;
    delete errorObject.trace;
  }

  return errorObject;
};

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export const httpError = (
  next: NextFunction,
  err: Error | unknown,
  req: Request,
  errorStatusCode: number = 500,
): void => {
  const errorObj = errorObject(err, req, errorStatusCode);
  return next(errorObj);
};
