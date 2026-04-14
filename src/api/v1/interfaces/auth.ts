import { type Request } from "express";
import { type IUser } from "@/api/v1/models/user.model";

export interface AuthRequest extends Request {
  user?: IUser;
}