import { Hono } from "hono";
import type { LocalDataImportSkippedRecord, LocalSettingsImport, Mode } from "../../shared/types";
import type { Db } from "../db/client";
import type { RequestLoggerVariables } from "../middleware/request-logger";
import { requireUser } from "../middleware/session";
import type { AuthVariables } from "../middleware/session";
import {
  getLocalDataImportStatus,
  importLocalData,
  skipLocalDataImport,
} from "../services/local-data-import";
import type { ValidatedLocalDataImport } from "../services/local-data-import";
import { parseImportedAttempt } from "./attempts";
import { parseProblem } from "./problems";
import { isNonEmptyString, isRecord } from "./validation";
import type { FieldErrors } from "./validation";

type RouterVariables = RequestLoggerVariables & AuthVariables;
type ParsedRequest =
  | { ok: true; action: "skip"; idempotencyToken: string }
  | {
      ok: true;
      action: "import";
      idempotencyToken: string;
      data: ValidatedLocalDataImport;
    }
  | { ok: false; fieldErrors: FieldErrors };

const MODES = new Set<Mode>(["copy", "recall", "free"]);

function recordId(value: unknown, index: number): string {
  return isRecord(value) && isNonEmptyString(value.id) ? value.id.trim() : `#${index + 1}`;
}

function invalidRecord(
  collection: LocalDataImportSkippedRecord["collection"],
  id: string,
): LocalDataImportSkippedRecord {
  return { collection, id, reason: "invalid" };
}

function parseSettings(value: unknown): {
  settings?: LocalSettingsImport;
  skipped?: LocalDataImportSkippedRecord;
} {
  if (!isRecord(value)) return { skipped: invalidRecord("settings", "current") };
  const settings: LocalSettingsImport = {};
  if (value.mode !== undefined) {
    if (typeof value.mode !== "string" || !MODES.has(value.mode as Mode)) {
      return { skipped: invalidRecord("settings", "current") };
    }
    settings.mode = value.mode as Mode;
  }
  if (value.distractionFree !== undefined) {
    if (typeof value.distractionFree !== "boolean") {
      return { skipped: invalidRecord("settings", "current") };
    }
    settings.distractionFree = value.distractionFree;
  }
  // Deliberately ignore unsupported legacy keys (theme, smoothCaret, UI state).
  return Object.keys(settings).length === 0 ? {} : { settings };
}

function parseRequest(body: unknown): ParsedRequest {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: ["Must be a JSON object."] } };
  const fieldErrors: FieldErrors = {};
  if (!isNonEmptyString(body.idempotencyToken) || body.idempotencyToken.length > 200) {
    fieldErrors.idempotencyToken = ["A token of at most 200 characters is required."];
  }
  if (body.action !== "import" && body.action !== "skip") {
    fieldErrors.action = ["Must be import or skip."];
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  const idempotencyToken = (body.idempotencyToken as string).trim();
  if (body.action === "skip") return { ok: true, action: "skip", idempotencyToken };

  for (const field of ["customProblems", "overrides", "tombstones", "attempts"] as const) {
    if (!Array.isArray(body[field])) fieldErrors[field] = ["Must be an array."];
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  const skipped: LocalDataImportSkippedRecord[] = [];
  const customProblems = (body.customProblems as unknown[]).flatMap((candidate, index) => {
    const parsed = parseProblem(candidate, "custom");
    if (parsed.ok) return [parsed.value];
    skipped.push(invalidRecord("customProblems", recordId(candidate, index)));
    return [];
  });
  const overrides = (body.overrides as unknown[]).flatMap((candidate, index) => {
    const parsed = parseProblem(candidate, "bundled");
    if (parsed.ok) return [parsed.value];
    skipped.push(invalidRecord("overrides", recordId(candidate, index)));
    return [];
  });
  const tombstones = (body.tombstones as unknown[]).flatMap((candidate, index) => {
    if (isNonEmptyString(candidate)) return [candidate.trim()];
    skipped.push(invalidRecord("tombstones", `#${index + 1}`));
    return [];
  });
  const attempts = (body.attempts as unknown[]).flatMap((candidate, index) => {
    const parsed = parseImportedAttempt(candidate);
    if (parsed.ok) return [parsed.value];
    skipped.push(invalidRecord("attempts", recordId(candidate, index)));
    return [];
  });

  const settingsResult = body.settings === undefined ? {} : parseSettings(body.settings as unknown);
  if (settingsResult.skipped !== undefined) skipped.push(settingsResult.skipped);

  return {
    ok: true,
    action: "import",
    idempotencyToken,
    data: {
      customProblems,
      overrides,
      tombstones,
      attempts,
      ...(settingsResult.settings === undefined ? {} : { settings: settingsResult.settings }),
      skipped,
    },
  };
}

export function createLocalDataImportRouter(db: Db) {
  const router = new Hono<{ Variables: RouterVariables }>();

  router.get("/", requireUser, (c) => c.json(getLocalDataImportStatus(db, c.var.user!.id)));

  router.post("/", requireUser, async (c) => {
    const parsed = parseRequest(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: "VALIDATION",
            message: "Invalid local data Import.",
            requestId: c.var.requestId,
            fieldErrors: parsed.fieldErrors,
          },
        },
        400,
      );
    }

    const result =
      parsed.action === "skip"
        ? skipLocalDataImport(db, c.var.user!.id, parsed.idempotencyToken)
        : importLocalData(db, c.var.user!.id, parsed.idempotencyToken, parsed.data);
    if (result.kind === "already-decided") {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: "A local data Import decision is already recorded.",
            requestId: c.var.requestId,
          },
        },
        409,
      );
    }
    return c.json(
      { report: result.report, replayed: result.replayed },
      result.replayed ? 200 : 201,
    );
  });

  return router;
}
