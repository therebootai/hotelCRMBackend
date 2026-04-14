import { Request, Response, NextFunction } from "express";
import { ZodObject, ZodError, ZodRawShape } from "zod";
import { httpError } from "@/api/v1/utils/httpError";

export const validateRequest = (schema: ZodObject<ZodRawShape>) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues
          .map(
            (err) => `${String(err.path[err.path.length - 1])}: ${err.message}`,
          )
          .join(", ");

        const validationError = new Error(
          `Validation Failed -> ${errorMessages}`,
        );

        return httpError(next, validationError, req, 400);
      }

      return httpError(next, error, req, 400);
    }
  };
};
