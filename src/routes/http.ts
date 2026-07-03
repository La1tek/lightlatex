import { Response } from "express";
import { ProjectAccessError } from "../auth/projectAccess";
import { HttpError } from "../shared/errors";

export function errorStatus(err: unknown, fallback = 400) {
  if (err instanceof ProjectAccessError) return err.status;
  if (err instanceof HttpError) return err.status;
  if (err instanceof Error && err.message.includes("not found")) return 404;
  return fallback;
}

export function sendError(res: Response, err: unknown, fallback = 400) {
  const message = err instanceof Error ? err.message : "Request failed";
  res.status(errorStatus(err, fallback)).json({ error: message });
}
