'use strict';

const { StatusCodes, StatusMessages } = require('./error.response');

// ─── Alarm Severity Levels ────────────────────────────────────────────────────
// Internal only — NEVER sent to client

const AlarmLevel = Object.freeze({
  NONE:     'none',     // Normal activity
  LOW:      'low',      // Minor anomaly (e.g., unusual signup time)
  MEDIUM:   'medium',   // Moderate concern (e.g., multiple signins from new IP)
  HIGH:     'high',     // Serious concern (e.g., admin key created outside business hours)
  CRITICAL: 'critical'  // Immediate attention needed (e.g., bulk data access via API key)
});

// ─── Hidden Alarm Logger ──────────────────────────────────────────────────────

/**
 * Silently logs an alarm for internal monitoring without exposing it to the client.
 * In production, pipe this to your monitoring service (Datadog, Sentry, CloudWatch, etc.)
 * @param {Object} alarm - { level, event, meta }
 */
function _triggerAlarm({ level, event, meta = {} }) {
  if (level === AlarmLevel.NONE) return; // Skip if no alarm

  const alarmPayload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    meta
  };

  // ─── Internal logging (never sent to client) ───────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const colors = {
      low:      '\x1b[33m',   // Yellow
      medium:   '\x1b[35m',   // Magenta
      high:     '\x1b[31m',   // Red
      critical: '\x1b[41m'    // Red background
    };
    const reset = '\x1b[0m';
    const color = colors[level] || reset;
    console.warn(`${color}[ALARM:${level.toUpperCase()}] ${event}${reset}`, meta);
  }

  // ─── Production: pipe to monitoring service ────────────────────────────────
  // Example integrations (uncomment and configure as needed):
  // Sentry.captureEvent({ message: event, level, extra: meta });
  // datadogLogs.logger.warn(event, { ...alarmPayload });
  // await slackWebhook.send({ text: `[ALARM:${level}] ${event}` });
  // alarmQueue.add('process-alarm', alarmPayload); // BullMQ job queue

  // Store in DB for audit trail (async, non-blocking)
  // AlarmLog.create(alarmPayload).catch(console.error);
}

// ─── Base Success Response Class ──────────────────────────────────────────────

class SuccessResponse {
  /**
   * @param {Object} options
   * @param {string}  options.message    - Human-readable success message
   * @param {number}  options.statusCode - HTTP status code (default: 200)
   * @param {*}       options.data       - Response payload (default: {})
   * @param {Object}  options.metadata   - Optional pagination/meta info
   * @param {Object}  options.alarm      - Internal alarm (never sent to client)
   *   alarm: { level: AlarmLevel, event: string, meta: Object }
   */
  constructor({
    message    = StatusMessages[StatusCodes.OK],
    statusCode = StatusCodes.OK,
    data       = {},
    metadata   = null,
    alarm      = null
  }) {
    this.message    = message;
    this.statusCode = statusCode;
    this.data       = data;
    this.metadata   = metadata;

    // Trigger hidden alarm if provided (internal only)
    if (alarm && alarm.level && alarm.level !== AlarmLevel.NONE) {
      _triggerAlarm(alarm);
    }
  }

  /**
   * Sends the response to the client.
   * NOTE: alarm data is intentionally excluded from the response body.
   * @param {Object} res - Express response object
   * @returns {Object} Express response
   */
  send(res) {
    const responseBody = {
      status:  'success',
      message: this.message,
      data:    this.data
    };

    // Attach metadata only if provided (e.g., pagination)
    if (this.metadata) {
      responseBody.metadata = this.metadata;
    }

    return res.status(this.statusCode).json(responseBody);
  }
}

// ─── Specific Success Response Classes ────────────────────────────────────────

/**
 * 200 – OK
 * Standard successful response.
 * Example: fetching appointments, getting barber schedule.
 */
class OKResponse extends SuccessResponse {
  constructor({ message = 'Success.', data, metadata, alarm } = {}) {
    super({ message, statusCode: StatusCodes.OK, data, metadata, alarm });
  }
}

/**
 * 201 – Created
 * Resource successfully created.
 * Example: new customer signup, new appointment booked.
 */
class CreatedResponse extends SuccessResponse {
  constructor({ message = 'Resource created successfully.', data, metadata, alarm } = {}) {
    super({ message, statusCode: StatusCodes.CREATED, data, metadata, alarm });
  }
}

/**
 * 204 – No Content
 * Successful action with no body (e.g., delete, logout).
 * NOTE: 204 responses must not include a body — send() handles this.
 */
class NoContentResponse {
  constructor({ alarm } = {}) {
    if (alarm && alarm.level !== AlarmLevel.NONE) {
      _triggerAlarm(alarm);
    }
  }

  send(res) {
    return res.status(StatusCodes.NO_CONTENT).end();
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Alarm system
  AlarmLevel,

  // Base class
  SuccessResponse,

  // Specific classes
  OKResponse,
  CreatedResponse,
  NoContentResponse
};