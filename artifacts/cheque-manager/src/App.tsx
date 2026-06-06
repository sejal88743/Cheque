import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import { Landmark, FileText, Settings as SettingsIcon } from "lucide-react";

const queryClient = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground shadow-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="h-6 w-6 text-accent" />
            <h1 className="text-xl font-bold tracking-tight">CheqMgr</h1>
          </div>
          <nav className="flex items-center gap-1 sm:gap-4">
            <Link href="/" className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === '/' ? 'bg-primary-foreground/10 text-white' : 'text-primary-foreground/70 hover:text-white hover:bg-primary-foreground/5'}`}>
              Entry
            </Link>
            <Link href="/reports" className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === '/reports' ? 'bg-primary-foreground/10 text-white' : 'text-primary-foreground/70 hover:text-white hover:bg-primary-foreground/5'}`}>
              Reports
            </Link>
            <Link href="/settings" className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${location === '/settings' ? 'bg-primary-foreground/10 text-white' : 'text-primary-foreground/70 hover:text-white hover:bg-primary-foreground/5'}`}>
              <SettingsIcon className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6 max-w-5xl">
        {children}
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Layout><Home /></Layout>} />
      <Route path="/reports" component={() => <Layout><Reports /></Layout>} />
      <Route path="/settings" component={() => <Layout><Settings /></Layout>} />
      <Route component={() => <Layout><NotFound /></Layout>} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
