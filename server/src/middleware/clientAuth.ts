import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export interface ClientTokenPayload {
  sub: string;
  role: "client";
}

export interface ClientAuthedRequest extends Request {
  clientId?: number;
}

function readClientId(req: Request): number | null {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    if (decoded.role !== "client") return null;

    const id = Number(decoded.sub);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function requireClient(
  req: ClientAuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentification client requise.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    if (decoded.role !== "client") {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Accès refusé.",
      });
    }

    const id = Number(decoded.sub);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(401).json({
        error: "INVALID_TOKEN",
        message: "Session invalide ou expirée.",
      });
    }

    req.clientId = id;
    next();
  } catch {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Session invalide ou expirée.",
    });
  }
}

export function optionalClientAuth(
  req: ClientAuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  // Aucun token = parcours invité normal.
  if (!header) {
    next();
    return;
  }

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Session invalide. Veuillez vous reconnecter.",
    });
  }

  const clientId = readClientId(req);
  if (!clientId) {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Session invalide ou expirée. Veuillez vous reconnecter.",
    });
  }

  req.clientId = clientId;
  next();
}

export function signClientToken(clientId: number): string {
  return jwt.sign(
    { role: "client" },
    JWT_SECRET,
    {
      subject: String(clientId),
      expiresIn: "30d",
    }
  );
}
