import React, { useEffect, useState } from 'react';
import { useSessionStore } from '../store/sessionStore';
import { sessionsAPI } from '../services/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';


const Dashboard: React.FC = () => {
    const [kpiDocs, setKpiDocs] = useState(0);
    const [kpiActiveSessions, setKpiActiveSessions] = useState(0);
    const [kpiTime, setKpiTime] = useState(0);
    const [kpiAccuracy, setKpiAccuracy] = useState(0);
    const [kpiSessions, setKpiSessions] = useState(0);
    const [recentSessions, setRecentSessions] = useState<any[]>([]);
    const [data, setData] = useState<any[]>([]);
    const [breakdownData, setBreakdownData] = useState<any[]>([]);

    const { sessions, loadSessions } = useSessionStore();

    // ✅ reusable animation
    const animateCounter = (
        end: number,
        setter: React.Dispatch<React.SetStateAction<number>>,
        duration = 1500
    ) => {
        let start = 0;
        const step = end / (duration / 16);

        const timer = setInterval(() => {
            start = Math.min(start + step, end);
            setter(Math.floor(start));
            if (start >= end) clearInterval(timer);
        }, 16);
    };

    // ✅ Static KPIs (time + accuracy only)
    useEffect(() => {
        animateCounter(2, setKpiTime);
        animateCounter(97, setKpiAccuracy);
    }, []);

    // ✅ Load sessions into Zustand
    useEffect(() => {
        loadSessions();
    }, []);

    // ✅ Total Sessions (from store)
    useEffect(() => {
        if (!sessions) return;
        animateCounter(sessions.length, setKpiSessions);
    }, [sessions]);

    // ✅ Fetch sessions (for docs count + recent sessions)
    useEffect(() => {
        const fetchSessions = async () => {
            try {
                const data = await sessionsAPI.getAll();
                const sessionsList = data?.sessions || data || [];
                console.log(sessionsList)

                // Total Documents
                animateCounter(sessionsList.length, setKpiDocs);

                // Recent sessions
                const sorted = [...sessionsList].reverse();
                setRecentSessions(sorted.slice(0, 6));
            } catch (err) {
                console.error("Failed to fetch sessions", err);
                setRecentSessions([]);
                setKpiDocs(0);
            }
        };

        fetchSessions();
    }, []);

    // ✅ Active Sessions (magic-box)
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/lc/magic-box");
                if (!res.ok) throw new Error("Failed");

                const json = await res.json();
                const activeCount = json?.count || 0;

                animateCounter(activeCount, setKpiActiveSessions);
                setData(Array.isArray(json.data) ? json.data : []);
            } catch (err) {
                console.error(err);
                setData([]);
            }
        };

        load();
    }, []);

    useEffect(() => {
        if (!data || data.length === 0) return;

        // 🔢 count by document type (instrument)
        const counts: Record<string, number> = {};

        data.forEach((item: any) => {
            const type = item.instrument || "Unknown";
            counts[type] = (counts[type] || 0) + 1;
        });

        const total = data.length;

        // 🎨 optional color palette
        const colors = [
            "#2563eb",
            "#7c3aed",
            "#06b6d4",
            "#10b981",
            "#f59e0b",
            "#ef4444"
        ];

        const formatted = Object.entries(counts).map(
            ([name, count], index) => ({
                name,
                count,
                color: colors[index % colors.length],
                width: `${Math.round((count / total) * 100)}%`
            })
        );

        setBreakdownData(formatted);
    }, [data]);

    return (
        <>


            <div className=" mt-2 flex flex-col min-h-screen card">

                {/* ── MAIN ── */}
                <main className="flex-1 ">

                    {/* HEADER */}
                    <header className='flex flex-col md:flex-row md:items-center md:justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
                        <div>
                            <h1 className="text-4xl font-semibold text-gray-800 dark:text-gray-700">
                                Dashboard
                            </h1>

                            <p className="text-sm text-gray-900 dark:text-gray-700 mt-1">
                                Real-time processing analytics & performance metrics
                            </p>
                        </div>

                    </header>

                    {/* ── CONTENT ── */}
                    <div className="p-6 space-y-6">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

                            <Card className="relative overflow-hidden rounded-xl border shadow-sm backdrop-blur transition-all duration-300 
                                bg-white/95 border-slate-200 hover:shadow-md
                                dark:bg-slate-900/80 dark:border-slate-700 dark:hover:shadow-lg">

                                {/* Gradient overlay */}
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-cyan-400 opacity-[0.05] dark:opacity-[0.08]"></div>

                                {/* Glow */}
                                <div className="absolute -top-20 -right-20 w-48 h-48 bg-blue-500/10 dark:bg-blue-400/10 blur-3xl"></div>

                                {/* Top accent */}
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-400"></div>

                                <CardContent className="pt-6 relative">
                                    <div className="text-2xl mb-2">
                                        <i className="ki-duotone ki-file-sheet fs-2 text-primary"></i>
                                    </div>

                                    <div className="kpi-label">Total Documents</div>

                                    <div className="text-4xl font-bold mb-2 text-slate-900 dark:text-white">
                                        {kpiSessions}
                                    </div>
                                    <div className="kpi-change up">↑ 12.5% from last week</div>



                                </CardContent>

                            </Card>


                            {/* Avg Processing Time */}
                            <Card className="relative overflow-hidden rounded-xl border shadow-sm backdrop-blur transition-all duration-300 
                  bg-white/95 border-slate-200 hover:shadow-md
                  dark:bg-slate-900/80 dark:border-slate-700 dark:hover:shadow-lg">

                                <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-indigo-400 opacity-[0.05] dark:opacity-[0.08]"></div>
                                <div className="absolute -top-20 -right-20 w-48 h-48 bg-purple-500/10 blur-3xl"></div>
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 to-indigo-400"></div>

                                <CardContent className="pt-6 relative">
                                    <div className="text-2xl mb-2">  <i className="ki-duotone ki-time fs-2 text-purple"></i>
                                    </div>
                                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                                        Avg Processing Time
                                    </div>

                                    <div className="text-4xl font-bold mb-2 text-slate-900 dark:text-white">
                                        {kpiTime}s
                                    </div>

                                    <div className="text-xs font-medium text-green-600 dark:text-green-400">
                                        ↓ 8% improvement
                                    </div>
                                </CardContent>
                            </Card>


                            {/* Accuracy Rate */}
                            <Card className="relative overflow-hidden rounded-xl border shadow-sm backdrop-blur transition-all duration-300 
                  bg-white/95 border-slate-200 hover:shadow-md
                  dark:bg-slate-900/80 dark:border-slate-700 dark:hover:shadow-lg">

                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-teal-400 opacity-[0.05] dark:opacity-[0.08]"></div>
                                <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/10 blur-3xl"></div>
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-teal-400"></div>

                                <CardContent className="pt-6 relative">
                                    <div className="text-2xl mb-2">  <i className="ki-duotone ki-check-circle fs-2 text-success"></i>
                                    </div>
                                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                                        Accuracy Rate
                                    </div>

                                    <div className="text-4xl font-bold mb-2 text-slate-900 dark:text-white">
                                        {kpiAccuracy}%
                                    </div>

                                    <div className="text-xs font-medium text-green-600 dark:text-green-400">
                                        ↑ 2.3% increase
                                    </div>
                                </CardContent>
                            </Card>


                            {/* Active Sessions */}
                            <Card className="relative overflow-hidden rounded-xl border shadow-sm backdrop-blur transition-all duration-300 
                  bg-white/95 border-slate-200 hover:shadow-md
                  dark:bg-slate-900/80 dark:border-slate-700 dark:hover:shadow-lg">

                                <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-400 opacity-[0.05] dark:opacity-[0.08]"></div>
                                <div className="absolute -top-20 -right-20 w-48 h-48 bg-orange-500/10 blur-3xl"></div>
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-400"></div>

                                <CardContent className="pt-6 relative">
                                    <div className="text-2xl mb-2">  <i className="ki-duotone ki-category fs-2 text-warning"></i>
                                    </div>
                                    <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                                        Active Sessions
                                    </div>

                                    <div className="text-4xl font-bold mb-2 text-slate-900 dark:text-white">
                                        {kpiActiveSessions}
                                    </div>

                                    <div className="text-xs font-medium text-green-600 dark:text-green-400">
                                        ↑ 5 new today
                                    </div>
                                </CardContent>
                            </Card>

                        </div>

                        {/* Charts Section */}
                        <div className="card">

                            {/* Header */}
                            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-800">
                                    Recent Processing Events
                                </h3>
                            </div>

                            {/* Body */}
                            <div className="p-6">

                                {data.length === 0 ? (
                                    <div className="text-sm text-gray-500">No recent activity</div>
                                ) : (
                                    <div className="space-y-6">
                                        {[...data]
                                            .sort(
                                                (a, b) =>
                                                    new Date(b.createdAt).getTime() -
                                                    new Date(a.createdAt).getTime()
                                            )
                                            .slice(0, 6)
                                            .map((item: any, i: number) => {
                                                const status = item.status?.toLowerCase() || "created";

                                                const colorMap: Record<string, string> = {
                                                    created: "bg-cyan-500",
                                                    processing: "bg-blue-600",
                                                    completed: "bg-emerald-500",
                                                    failed: "bg-red-500",
                                                };

                                                const minutesAgo = Math.floor(
                                                    (Date.now() - new Date(item.createdAt).getTime()) / 60000
                                                );

                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex items-start gap-4 relative"
                                                    >
                                                        {/* Timeline Dot */}
                                                        <div className="relative flex flex-col items-center">
                                                            <div className={`w-3 h-3 rounded-full ${colorMap[status] || "bg-blue-600"}`} />

                                                            {/* vertical line */}
                                                            {i !== 5 && (
                                                                <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />
                                                            )}
                                                        </div>

                                                        {/* Content */}
                                                        <div className="flex-1 pb-2">
                                                            <div className="text-sm font-medium text-gray-800 dark:text-gray-800">
                                                                {item.lc_number || `Session ${item.id}`}{" "}
                                                                <span className="text-gray-500 dark:text-gray-700 font-normal">
                                                                    {status}
                                                                </span>
                                                            </div>

                                                            <div className="text-xs text-gray-700 mt-1">
                                                                {item.instrument || "LC"} · {item.customer_name || ""}
                                                            </div>


                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        </div>


                        {/* Document Types Breakdown */}
                        <div className="card mt-8">

                            {/* Header */}
                            <div className="px-6 py-4  border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-700">
                                    Document Types Distribution
                                </h3>
                            </div>

                            {/* Body */}
                            <div className="p-6 space-y-7">

                                {breakdownData.map((item, i) => (
                                    <div key={i} className="space-y-3">

                                        {/* Header row */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-800">
                                                {item.name}
                                            </span>

                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-700">
                                                {item.count.toLocaleString()} docs
                                            </span>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ">

                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{
                                                    width: item.width,
                                                    backgroundColor: item.color
                                                }}
                                            />
                                        </div>

                                    </div>
                                ))}

                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </>
    );
};

export default Dashboard;
