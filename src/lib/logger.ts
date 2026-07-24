import * as Sentry from '@sentry/nextjs';

export interface LogContext {
  action?: string;
  code?: string;
  tenant_id?: string;
  user_id?: string;
  [key: string]: any;
}

const isSentryConfigured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export const logger = {
  /**
   * Log UNEXPECTED system errors / bugs -> Triggers Sentry.captureException
   */
  error(err: any, context?: LogContext) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] [${context?.action || 'system'}] ${errorMessage}`, context || '');

    if (isSentryConfigured) {
      try {
        Sentry.withScope(scope => {
          if (context?.action) scope.setTag('action', context.action);
          if (context?.code) scope.setTag('code', context.code);
          if (context?.tenant_id) scope.setTag('tenant_id', context.tenant_id);
          if (context) scope.setExtras(context);

          if (err instanceof Error) {
            Sentry.captureException(err);
          } else {
            Sentry.captureException(new Error(errorMessage));
          }
        });
      } catch (sentryErr) {
        console.error('[LOGGER_FALLBACK] Failed to report to Sentry:', sentryErr);
      }
    }
  },

  /**
   * Log EXPECTED business errors / warnings -> Console + Breadcrumb, NO Sentry exception
   */
  warn(message: string, context?: LogContext) {
    console.warn(`[WARN] [${context?.action || 'business'}] ${message}`, context || '');

    if (isSentryConfigured) {
      try {
        Sentry.addBreadcrumb({
          category: context?.action || 'business_warning',
          message: `${message} (code: ${context?.code || 'N/A'})`,
          level: 'warning',
          data: context,
        });
      } catch (sentryErr) {
        // Fallback ignore
      }
    }
  },

  /**
   * Log general application events
   */
  info(message: string, context?: LogContext) {
    console.log(`[INFO] [${context?.action || 'app'}] ${message}`, context || '');

    if (isSentryConfigured) {
      try {
        Sentry.addBreadcrumb({
          category: context?.action || 'app_info',
          message,
          level: 'info',
          data: context,
        });
      } catch (sentryErr) {
        // Fallback ignore
      }
    }
  }
};
