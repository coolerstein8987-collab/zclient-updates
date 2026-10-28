// Gemeinsame Helfer für Express-Router.
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };
export const wrap = (fn) => async (req, res, next) => {
  try {
    const r = await fn(req, res);
    if (r !== undefined && !res.headersSent) res.json(r);
  } catch (e) {
    next(e);
  }
};
export const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
