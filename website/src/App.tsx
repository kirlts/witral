
import { Hero } from "./components/Hero";
import { Philosophy } from "./components/Philosophy";
import { Workflow } from "./components/Workflow";
import { UseCases } from "./components/UseCases";
import { QuickStart } from "./components/QuickStart";
import { Stack } from "./components/Stack";
import { Capabilities } from "./components/Capabilities";
import { Footer } from "./components/Footer";

function App() {
    return (
        <div className="min-h-screen bg-slate-50 relative overflow-hidden font-sans selection:bg-emerald-500/30">
            {/* Abstract Grid Background - Light */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

            {/* Main Content */}
            <main className="relative z-10">
                <Hero />
                <Philosophy />
                <Workflow />
                <Capabilities />
                <UseCases />
                <QuickStart />
                <Stack />
            </main>

            {/* Creator Footer */}
            <Footer />
        </div>
    );
}

export default App;
