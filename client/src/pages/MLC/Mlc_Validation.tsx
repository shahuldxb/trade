import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound";
import { Route, Switch, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare, Home as HomeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

// ✅ Lazy loading (performance + stability)
const Home = React.lazy(() => import("./pages/Home"));
const InstrumentScreen = React.lazy(() => import("./pages/InstrumentScreen"));
const LLMLogsScreen = React.lazy(() => import("./pages/LLMLogsScreen"));

// ✅ Safe icon mapping
const ICONS = {
  HomeIcon,
  FileText,
  MessageSquare,
};

// ✅ Dummy auth (replace with real auth logic)
const isAuthenticated = true;

function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { path: "/mlc/home", label: "Home", icon: "HomeIcon" },
    { path: "/mlc/instrument", label: "Instrument", icon: "FileText" },
    { path: "/mlc/llm-logs", label: "LLM Logs", icon: "MessageSquare" },
  ];

  return (
    <header className="">
      <div className="flex h-14 items-center">
        <div className="mr-4 flex">
          <Link href="/mlc/home" className="mr-6 flex items-center space-x-2">
            <span className="font-bold text-lg">MLC Validation</span>
          </Link>

          <nav className="flex items-center gap-4">
            {navItems.map((item) => {
              const Icon = ICONS[item.icon as keyof typeof ICONS] || HomeIcon;

              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "flex items-center gap-2 btn btn-primary btn-outline text-xs",
                      location === item.path && "bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

// ✅ Protected Route Wrapper
function ProtectedRoute({ component: Component }: { component: any }) {
  return isAuthenticated ? <Component /> : <NotFound />;
}

function Router() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <Switch>
        <Route path="/mlc/home" component={Home} />
        <Route path="/mlc/instrument" component={InstrumentScreen} />

        {/* 🔒 Protected Route */}
        <Route
          path="/mlc/llm-logs"
          component={() => <ProtectedRoute component={LLMLogsScreen} />}
        />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function Mlc_Validation() {

  useEffect(() => {
    // 🚫 Disable outer page scroll
    document.body.style.overflow = "hidden";

    return () => {
      // ✅ Restore scroll when leaving page
      document.body.style.overflow = "auto";
    };
  }, []);

  return (
    <TooltipProvider>
      <Toaster />

      {/* ✅ FULL SCREEN LOCK */}
      <div className="h-screen flex flex-col overflow-hidden card md:p-10 p-4 pt-6 pb-6">

        {/* ✅ FIXED NAV */}
        <Navigation />

        {/* ✅ ONLY THIS SCROLLS */}
        <main className="flex-1 overflow-y-auto md:px-6 min-h-0 pb-[150px]">
          <Router />

          <div className="card p-5 mt-4 ">
            <div className="text-center">
              <p className="text-sm">
                MLC - Letter of Credit Cycle Validation System
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Powered by Azure OpenAI
              </p>
            </div>
          </div>


        </main>



      </div>
    </TooltipProvider>
  );
}
export default Mlc_Validation;