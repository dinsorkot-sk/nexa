// Importing this module installs the mail record hooks (tracking, auto-follow, cleanup).
import './hooks.js';

export { mailModule, mailModels, mailAccess, mailRules } from './manifest.js';
export { MailThreadService, type MessagePostOptions, type MessageRow, type FollowerRow } from './thread.js';
export { ActivityService, type ActivityRow, type ActivityState, type ScheduleOptions } from './activity.js';
export {
  MailTemplateService, parseTemplate, validateTemplate, TEMPLATE_LIMITS, type InlineTemplate, type RenderedMail,
} from './template.js';
export { sanitizeHtml, escapeHtml, textToHtml, safeUrl } from './sanitize.js';
export { mailInstalled, isThread } from './message.js';
export { MailQueueService, type MailTransport } from './outgoing.js';
export { MailAliasService } from './inbound.js';
