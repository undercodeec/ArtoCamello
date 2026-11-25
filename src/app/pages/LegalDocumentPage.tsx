import ReactMarkdown from 'react-markdown';
import privacyPolicy from '../../../docs/POLITICA_DE_PRIVACIDAD.md?raw';
import termsOfService from '../../../docs/TERMINOS_DE_SERVICIO.md?raw';

export function LegalDocumentPage({ document }: { document: 'privacy' | 'terms' }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <article className="space-y-5 text-base leading-7 text-[#404145] [&_a]:text-blue-700 [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mb-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-[#101828] [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-[#101828] [&_li]:pl-1 [&_li]:marker:text-[#101828] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        <ReactMarkdown>{document === 'privacy' ? privacyPolicy : termsOfService}</ReactMarkdown>
      </article>
    </div>
  );
}
