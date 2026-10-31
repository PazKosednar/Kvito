import { useTranslation } from "react-i18next";
import { KvitaLogo } from "@/components/KvitaLogo";
import { ErrorState, LoadingState } from "@/components/layout-parts";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useQuery } from "@/hooks/useQuery";

interface Sample {
  id: string;
  title: string;
  check: string;
  text: string;
  svg: string;
}

/**
 * Manual test page for UPN QR codes (development only – the API hides the samples in production).
 * Open it on a computer and scan each code with the banking apps on your phone.
 */
export function UpnTestPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { data, loading, error } = useQuery<{ samples: Sample[] }>("/api/upn/samples");

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-8">
      <KvitaLogo withWordmark size="sm" />
      <h1 className="mt-8 text-title font-bold">{t("upnTest.title")}</h1>
      <div className="mt-3 max-w-[65ch] space-y-2 text-muted-foreground">
        <p>{t("upnTest.intro")}</p>
        <p className="font-medium text-destructive">{t("upnTest.warning")}</p>
      </div>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("upnTest.step1")}</li>
        <li>{t("upnTest.step2")}</li>
        <li>{t("upnTest.step3")}</li>
      </ol>
      {loading && <LoadingState />}
      {error ? <ErrorState message={toMessage(error)} /> : null}
      <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {data?.samples.map((s, i) => (
          <section key={s.id} className="flex flex-col gap-3">
            <h2 className="font-semibold">
              {i + 1}. {s.title}
            </h2>
            <div className="rounded-lg bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: s.svg }} />
            <p className="text-sm">{s.check}</p>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer py-1">{t("upnTest.payload")}</summary>
              <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 whitespace-pre">{s.text.split("\n").map((line, n) => `${String(n + 1).padStart(2, " ")}  ${line}`).join("\n")}</pre>
            </details>
          </section>
        ))}
      </div>
    </main>
  );
}
