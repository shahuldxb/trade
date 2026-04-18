import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import '../../../styles/demos/demo1.css'
interface LCType {
    name: string;
    icon: React.ReactNode;
    count: number;
    color: string;
}

export default function Home() {
    const [docCount, setDocCount] = useState(0);
    const [sessionCount, setSessionCount] = useState(0);
    const [accuracy, setAccuracy] = useState(0);
    const [speed, setSpeed] = useState(0);
    const [ocrLines, setOcrLines] = useState<string[]>([]);
    const [tickerItems, setTickerItems] = useState<string[]>([]);

    // Animate counter
    const animateCount = (
        setter: (value: number) => void,
        end: number,
        duration: number = 1800
    ) => {
        let start = 0;
        const step = end / (duration / 16);
        const timer = setInterval(() => {
            start = Math.min(start + step, end);
            setter(Math.floor(start));
            if (start >= end) clearInterval(timer);
        }, 16);
    };



    // Initialize counters
    useEffect(() => {
        const timeout = setTimeout(() => {
            animateCount(setDocCount, 12847);
            animateCount(setSessionCount, 342);
            animateCount(setAccuracy, 98);
            animateCount(setSpeed, 2);
        }, 400);
        return () => clearTimeout(timeout);
    }, []);

    // Refresh OCR display
    const refreshOCR = () => {
        const sessions = ['LC-2024-0051', 'LC-2024-0052', 'LC-2024-0053'];
        const docTypes = ['Bill of Lading', 'Commercial Invoice', 'Packing List'];
        const sess = sessions[Math.floor(Math.random() * sessions.length)];
        const doc = docTypes[Math.floor(Math.random() * docTypes.length)];
        const conf = (97 + Math.random() * 2.5).toFixed(1);
        const fields = Math.floor(28 + Math.random() * 22);


        const lines = [
            `▶ SESSION ${sess} initialized`,
            `  DOC_TYPE → ${doc}`,
            `  ISSUER   → Standard Chartered`,
            `  FIELDS   → ${fields} ✓`,
            `✓ CONFIDENCE ${conf}% — READY TO CATEGORIZE`,
        ];
        setOcrLines(lines);
    };

    // Initialize OCR and set interval
    useEffect(() => {
        refreshOCR();
        const interval = setInterval(refreshOCR, 5000);
        return () => clearInterval(interval);
    }, []);

    // Initialize ticker
    useEffect(() => {
        const items = [
            'LC-2024-0047 · Processed',
            'MT700 Issued · HSBC',
            'Bill of Lading · Verified',
            'Commercial Invoice · Extracted',
            'Packing List · Categorized',
            'Insurance Certificate · Assembled',
            'Draft · Analyzed',
            'Certificate of Origin · Confirmed',
            'Inspection Certificate · Queued',
        ];
        setTickerItems([...items, ...items]);
    }, []);

    const lcTypes: LCType[] = [
        { name: 'Letter of Credit', icon: <i className="ki-duotone ki-document  fs-2 text-primary"></i>, count: 2341, color: '#009ef7' },
        { name: 'Bill of Lading', icon: <i className="ki-duotone ki-ship fs-2 text-purple"></i>, count: 1892, color: '#7239ea' },
        { name: 'Commercial Invoice', icon: <i className="ki-duotone ki-file-added fs-2 text-success"></i>, count: 2105, color: '#50cd89' },
        { name: 'Packing List', icon: <i className="ki-duotone ki-package fs-2 text-warning"></i>, count: 1744, color: '#ffc700' },
        { name: 'Certificate of Origin', icon: <i className="ki-duotone ki-award fs-2 text-danger"></i>, count: 987, color: '#f1416c' },
        { name: 'Insurance Certificate', icon: <i className="ki-duotone ki-shield-tick fs-2 text-info"></i>, count: 654, color: '#009ef7' },
        { name: 'Draft / Bill of Exchange', icon: <i className="ki-duotone ki-pencil fs-2 text-purple"></i>, count: 823, color: '#7239ea' },
        { name: 'MT700 Swift Message', icon: <i className="ki-duotone ki-sms fs-2 text-success"></i>, count: 1102, color: '#50cd89' },
        { name: 'MT710 / MT720', icon: <i className="ki-duotone ki-message-text-2 fs-2 text-warning"></i>, count: 445, color: '#ffc700' },
        { name: 'Inspection Certificate', icon: <i className="ki-duotone ki-magnifier  fs-2 text-danger"></i>, count: 312, color: '#f1416c' },
        { name: 'Freight Invoice', icon: <i className="ki-duotone ki-delivery fs-2 text-primary"></i>, count: 567, color: '#009ef7' },
        { name: 'Deferred Payment LC', icon: <i className="ki-duotone ki-time fs-2 text-purple"></i>, count: 234, color: '#7239ea' },
    ];

    return (
        <div className="card rounded-2xl shadow-sm">


            {/* Hero Section */}
            <header className="py-10 ">
                <div className="container mx-auto px-4 text-center">
                    <Badge className="mb-4 bg-blue-500/20 text-blue-700 border-blue-400/30 capitalize">
                        <span className="w-2 h-2 bg-blue-700 rounded-full inline-block mr-2 animate-pulse "></span>
                        Live Processing Engine
                    </Badge>
                    <h1 className="text-[clamp(32px,4vw,52px)] font-extrabold leading-tight tracking-[-0.02em] bg-gradient-to-r from-white via-blue-600 to-purple-600 bg-clip-text text-transparent mb-[14px]">
                        OCR Factory
                    </h1>
                    <p className="text-xl  max-w-3xl mx-auto text-gray-800">
                        Intelligent trade document scanning, extraction, categorization, and assembly — powered by advanced optical character recognition.
                    </p>

                    <div className="overflow-hidden w-full max-w-2xl mx-auto relative my-4 px-2">
                        <div className="flex animate-scroll whitespace-nowrap min-w-full">
                            {tickerItems.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 text-xs sm:text-sm text-gray-600 font-medium flex-shrink-0"                >
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full "></span>
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>


                </div>
            </header>



            <main className="container mx-auto px-4 py-12 pt-0">
                {/* Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
                            <div className="text-4xl font-bold mb-2 text-slate-900 dark:text-white">
                                {docCount.toLocaleString()}
                            </div>
                            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                Documents Processed
                            </div>
                        </CardContent>

                    </Card>
                    <Card className="relative overflow-hidden rounded-xl border shadow-sm backdrop-blur transition-all duration-300 
  bg-white/95 border-slate-200 hover:shadow-md
  dark:bg-slate-900/80 dark:border-slate-700">

                        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 to-purple-400 opacity-[0.05] dark:opacity-[0.08]"></div>
                        <div className="absolute -top-20 -right-20 w-48 h-48 bg-violet-500/10 blur-3xl"></div>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-600 to-purple-400"></div>

                        <CardContent className="pt-6 relative">
                            <div className="text-4xl font-bold mb-2 text-slate-900 dark:text-white">
                                {sessionCount}
                            </div>
                            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                Active Sessions
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="relative overflow-hidden rounded-xl border shadow-sm backdrop-blur transition-all duration-300 
  bg-white/95 border-slate-200 hover:shadow-md
  dark:bg-slate-900/80 dark:border-slate-700">

                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-green-400 opacity-[0.05] dark:opacity-[0.08]"></div>
                        <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-500/10 blur-3xl"></div>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 to-green-400"></div>

                        <CardContent className="pt-6 relative">
                            <div className="text-4xl font-bold mb-2 text-slate-900 dark:text-white">
                                {accuracy}%
                            </div>
                            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                OCR Accuracy
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="relative overflow-hidden rounded-xl border shadow-sm backdrop-blur transition-all duration-300 
  bg-white/95 border-slate-200 hover:shadow-md
  dark:bg-slate-900/80 dark:border-slate-700">

                        <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-400 opacity-[0.05] dark:opacity-[0.08]"></div>
                        <div className="absolute -top-20 -right-20 w-48 h-48 bg-orange-400/10 blur-3xl"></div>
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-400"></div>

                        <CardContent className="pt-6 relative">
                            <div className="text-4xl font-bold mb-2 text-slate-900 dark:text-white">
                                {speed}s
                            </div>
                            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                Avg. Processing Time
                            </div>
                        </CardContent>
                    </Card>
                </div>



                {/* PIPELINE */}
                <div className="flex items-center justify-center gap-6 mb-10 flex-wrap">

                    {/* 1. DOCUMENT */}
                    <Card className="w-[260px] h-[260px] flex-shrink-0 relative rounded-2xl border border-blue-200 shadow-sm card">

                        <CardHeader className="pb-2">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-400 flex items-center gap-2">
                                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-blue-500 text-white text-xs">1</span>
                                DOCUMENT INGESTION
                            </h3>
                        </CardHeader>

                        <CardContent>
                            <div className="flex flex-col items-center justify-center h-[180px]">

                                {/* 📄 STACK WRAPPER (IMPORTANT) */}
                                <div className="relative w-28 h-36 overflow-hidden isolate">

                                    {/* 🔥 SCAN BEAM (OVER ENTIRE STACK) */}
                                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
                                        <div className="absolute left-0 w-full h-[3px]
                       bg-gradient-to-r from-transparent via-cyan-400 to-transparent
                       shadow-[0_0_12px_#22d3ee]
                        animate-scan-y">
                                        </div>
                                    </div>

                                    {/* Back doc */}
                                    <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-md border card opacity-50"></div>

                                    {/* Middle doc */}
                                    <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-md border card opacity-70"></div>

                                    {/* Front doc */}
                                    <div className="relative w-full h-full rounded-md border card shadow-sm">
                                        <div className="p-3">
                                            <div className="w-full h-1.5 bg-blue-400 rounded mb-2"></div>
                                            <div className="w-4/5 h-1 bg-gray-200 mb-1"></div>
                                            <div className="w-3/5 h-1 bg-gray-200 mb-1"></div>
                                            <div className="w-4/5 h-1 bg-gray-200"></div>
                                        </div>
                                    </div>

                                </div>

                                <p className="text-xs text-slate-900 dark:text-slate-400 mt-4">
                                    Scan · Upload · Import
                                </p>
                            </div>
                        </CardContent>
                    </Card>


                    {/* 🔥 ARROW (CENTER PERFECT) */}
                    <div className="flex items-center justify-center w-[80px] flex-shrink-0">
                        <div className="relative w-full h-[3px] bg-gradient-to-r from-blue-500 to-violet-500 rounded-full">

                            {/* moving dot */}
                            <div className="absolute w-3 h-3 bg-cyan-400 rounded-full -top-[5px] animate-travel shadow-md"></div>

                            {/* arrow head */}
                            <div className="absolute right-[-6px] top-[-6px] 
        border-t-[7px] border-b-[7px] border-l-[12px]
        border-t-transparent border-b-transparent border-l-violet-500">
                            </div>
                        </div>
                    </div>


                    {/* 2. OCR PANEL */}
                    <Card className="flex-1 min-h-[260px] min-w-[300px] rounded-2xl border border-gray-200 shadow-sm card">


                        <CardHeader className="pb-2">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-400 flex items-center gap-2">
                                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-violet-500 text-slate-900 dark:text-slate-400 text-xs">2</span>
                                OCR EXTRACTION ENGINE
                            </h3>
                        </CardHeader>

                        <CardContent>
                            <div className="rounded-lg p-4 min-h-[160px] font-mono text-sm bg-gray-100 text-gray-800">

                                {ocrLines.map((line, idx) => (
                                    <div key={idx} className="py-1">
                                        <span
                                            className="type-line"
                                            style={{ animationDelay: `${idx * 1.2}s` }}
                                        >
                                            {line}
                                        </span>
                                    </div>
                                ))}

                                <span className="inline-block w-1 h-4 bg-green-500 ml-1 animate-blink"></span>
                            </div>
                        </CardContent>
                    </Card>

                </div>


                {/* Categories Section */}
                <Card className="card shadow-sm mb-8 relative z-0">
                    <CardHeader className="border-b border-slate-200 mb-8">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-400">
                            17 LC Document Types
                        </h3>
                    </CardHeader>

                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {lcTypes.map((lc, idx) => {
                                const pct = Math.round((lc.count / 2341) * 100);

                                return (
                                    <div
                                        key={idx}
                                        className="card py-3 px-2 relative overflow-hidden isolate transition-all duration-300 group
                       bg-white dark:bg-gray-100
                       hover:shadow-md "
                                    >
                                        {/* 🔥 Glow (contained properly now) */}
                                        <div
                                            className="absolute -inset-10 opacity-0 group-hover:opacity-100 transition-all duration-500 blur-2xl z-0 pointer-events-none"
                                            style={{
                                                background: lc.color,
                                                mixBlendMode: "soft-light",
                                            }}
                                        />

                                        {/* 🎨 Tint overlay */}
                                        <div
                                            className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 z-0 pointer-events-none"
                                            style={{
                                                background: lc.color,
                                            }}
                                        />

                                        {/* ✅ Content (always above overlays) */}
                                        <div className="relative z-10">
                                            <div className="mb-2">
                                                {lc.icon}
                                            </div>

                                            <div className="fw-bold mb-1 text-sm">
                                                {lc.name}
                                            </div>

                                            <div className="cat-count fs-4">
                                                {lc.count.toLocaleString()} docs
                                            </div>

                                            {/* 📊 Progress bar */}
                                            <div
                                                className="position-absolute bottom-0 start-0 h-5px"
                                                style={{
                                                    width: `${pct}%`,
                                                    background: lc.color,
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Assembly Pipeline */}
                <Card className="card shadow-sm">
                    <CardHeader className="border-b border-slate-200 mb-8">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-400">
                            Consolidation & Assembly Pipeline
                        </h3>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                            {[
                                {
                                    icon: <i className="ki-duotone ki-magnifier fs-2 text-primary"></i>,
                                    name: 'Analyze',
                                    desc: 'Field extraction & validation',
                                    color: ''
                                },
                                {
                                    icon: <i className="ki-duotone ki-category fs-2 text-purple"></i>,
                                    name: 'Categorize',
                                    desc: '17 LC types auto-classified',
                                    color: ''
                                },
                                {
                                    icon: <i className="ki-duotone ki-arrows-loop fs-2 text-success"></i>,
                                    name: 'Consolidate',
                                    desc: 'Cross-reference & link records',
                                    color: ''
                                },
                                {
                                    icon: <i className="ki-duotone ki-element-11 fs-2 text-warning"></i>,
                                    name: 'Assemble',
                                    desc: 'Package complete LC set',
                                    color: ''
                                },
                                {
                                    icon: <i className="ki-duotone ki-check-circle fs-2 text-danger"></i>,
                                    name: 'Deliver',
                                    desc: 'Export & archive output',
                                    color: ''
                                }
                            ].map((step, idx) => (
                                <div key={idx} className="text-center">
                                    <div
                                        className={`w-12 h-12 rounded-lg flex items-center justify-center text-xl mx-auto mb-3 ${step.color}`}
                                    >
                                        {step.icon}
                                    </div>
                                    <div className="font-semibold text-slate-900 dark:text-slate-400 mb-1">
                                        {step.name}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-300">
                                        {step.desc}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </main>


        </div >
    );
}