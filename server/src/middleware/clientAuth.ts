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

/**
 * ============================================================
 * AUTHENTIFICATION CLIENT OPTIONNELLE
 * ============================================================
 *
 * CORRECTIF IMPORTANT :
 * Avant, un token présent mais invalide/expiré faisait échouer
 * la requête entière (401) — même pour la réservation, qui doit
 * TOUJOURS rester possible sans compte. Un client dont la
 * session a expiré ne pouvait alors plus réserver du tout tant
 * qu'il n'avait pas manuellement supprimé son token.
 *
 * Cette fonction est "optionnelle" par définition : elle ne
 * doit donc JAMAIS bloquer la requête. Si le token est absent,
 * invalide ou expiré, on continue simplement en mode invité
 * (req.clientId reste undefined) au lieu de renvoyer une erreur.
 */
export function optionalClientAuth(
  req: ClientAuthedRequest,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  // Aucun token = parcours invité normal.
  if (!header || !header.startsWith("Bearer ")) {
    next();
    return;
  }

  // Token présent : on tente de l'identifier, mais un échec
  // (expiré, invalide, compte supprimé) ne bloque jamais la
  // réservation — on continue simplement sans identité client.
  const clientId = readClientId(req);
  if (clientId) {
    req.clientId = clientId;
  }

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