import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { PwaUpdatePrompt } from "@/components/PwaUpdatePrompt";
import { ConfirmHost } from "@/components/confirm-host";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { bootstrapSession } from "@/hooks/useAuth";
import { router } from "@/router";

export function App() {
  useEffect(() => {
    void bootstrapSession();
  }, []);

  return (
    <ThemeProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" richColors />
      <ConfirmHost />
      <PwaUpdatePrompt />
    </ThemeProvider>
  );
}
