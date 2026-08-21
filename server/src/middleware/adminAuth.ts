import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export interface AuthedRequest extends Request {
  isAdmin?: boolean;
}

export function signAdminToken(): string {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "12h" });
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentification requise." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    if (decoded.role !== "admin") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Accès refusé.",
      });
    }

    req.isAdmin = true;
    next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN", message: "Session invalide ou expirée." });
  }
}
