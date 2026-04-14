import { type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "@/api/v1/models/user.model";
import { type AuthRequest } from "@/api/v1/interfaces/auth";
import { httpError } from "@/api/v1/utils/httpError";
import env from "@/config/env";

interface JwtPayload {
  id: string;
  role: "admin" | "receptionist";
}

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return httpError(next, new Error("Not authorized to access this route. No token provided."), req, 401);
    }

    const decoded = jwt.verify(token, env.TOKEN_SECRET as string) as JwtPayload;

    const user = await User.findById(decoded.id);

    if (!user) {
      return httpError(next, new Error("The user belonging to this token no longer exists."), req, 401);
    }

    if (!user.isActive) {
      return httpError(next, new Error("Account is disabled. Contact Admin."), req, 403);
    }

    req.user = user;

    return next();
  } catch (error) {
    return httpError(next, error, req, 401);
  }
};