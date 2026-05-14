import createError from "http-errors";
import { User } from "../models/User.js";
import { verifyAccessToken } from "../utils/token.js";

export async function requireAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : (req.cookies?.nexvocal_at || req.cookies?.nextalk_at);
    if (!token) throw createError(401, "Unauthorized");

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).lean();
    if (!user) throw createError(401, "Unauthorized");
    req.user = user;
    next();
  } catch (_error) {
    next(createError(401, "Unauthorized"));
  }
}
