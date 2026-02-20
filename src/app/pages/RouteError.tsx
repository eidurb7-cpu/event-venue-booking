import { isRouteErrorResponse, useRouteError } from 'react-router';

export default function RouteError() {
  const error = useRouteError();

  let title = 'Etwas ist schiefgelaufen';
  let message = 'Bitte Seite neu laden oder spaeter erneut versuchen.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    if (typeof error.data === 'string') {
      message = error.data;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white border border-gray-200 rounded-xl shadow-sm p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">{title}</h1>
        <p className="text-gray-600 mb-6">{message}</p>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-purple-600 text-white px-5 py-2.5 hover:bg-purple-700 transition-colors"
        >
          Zur Startseite
        </a>
      </div>
    </div>
  );
}

