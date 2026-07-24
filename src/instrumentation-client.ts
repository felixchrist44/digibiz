import * as Sentry from '@sentry/nextjs';

function sanitizeSentryEvent<T extends Sentry.Event>(event: T): T {
  if (event.request?.headers) {
    delete event.request.headers['authorization'];
    delete event.request.headers['cookie'];
    delete event.request.headers['x-user-id'];
    delete event.request.headers['x-user-role'];
    delete event.request.headers['x-tenant-id'];
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.filter(b => {
      const str = JSON.stringify(b);
      return !str.includes('eyJhbGci') && !str.includes('password');
    });
  }

  return event;
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    return sanitizeSentryEvent(event);
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
