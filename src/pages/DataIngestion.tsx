import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Upload, FileText, CheckCircle2, X, Plus, Smartphone,
  Database, ArrowRight, Cpu, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useCreateLead, useBulkUpload } from "@/hooks/useLeads";

interface FormData {
  projectName: string;
  location: string;
  value: string;
  developer: string;
  stage: string;
  type: string;
  floors: string;
  gfa: string;
}

const PIPELINE_STEPS = [
  { icon: Upload, label: "File Upload", desc: "CSV / PDF parsed" },
  { icon: Cpu, label: "AI Scoring", desc: "BU match computed" },
  { icon: Database, label: "Stored", desc: "Lead saved to DB" },
  { icon: BarChart3, label: "Dashboard", desc: "KPIs updated" },
];

export default function DataIngestion() {
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  // Real counts from the backend — defaults mimic the mock until API responds
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [flaggedCount, setFlaggedCount] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>();

  const { mutateAsync: createLead } = useCreateLead();
  const { mutateAsync: uploadCSV } = useBulkUpload();

  // Track animation timeouts so we can cancel them on failure or unmount.
  const animationTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear any pending animation timers when the component unmounts.
  useEffect(() => {
    return () => {
      animationTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    const isCSV = file?.name.toLowerCase().endsWith(".csv");
    const isPDF = file?.name.toLowerCase().endsWith(".pdf");
    if (file && (isCSV || isPDF)) {
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "File too large", description: "Please upload a file under 50\u00a0MB.", variant: "destructive" });
        return;
      }
      processFile(file);
    } else {
      toast({ title: "Unsupported file type", description: "Only .csv and .pdf files are accepted for bulk ingestion.", variant: "destructive" });
    }
  };

  const processFile = (file: File) => {
    // Cancel any still-running animation timers from a previous upload.
    animationTimeoutsRef.current.forEach(clearTimeout);

    setUploadedFile(file);
    setUploading(true);
    setUploadSuccess(false);
    setImportedCount(null);
    setFlaggedCount(null);
    setUploadErrors([]);
    setActiveStep(0);

    // Animate through the pipeline steps regardless of API speed for good UX
    const delays = [0, 600, 1200, 1800];
    animationTimeoutsRef.current = delays.map((delay, i) =>
      setTimeout(() => setActiveStep(i), delay)
    );

    // Call the real backend bulk ingest API concurrently with the animation
    uploadCSV(file)
      .then((result) => {
        // Clear animation timers — upload finished, no more step-advancing needed.
        animationTimeoutsRef.current.forEach(clearTimeout);
        animationTimeoutsRef.current = [];
        setImportedCount(result.imported);
        setFlaggedCount(result.flagged);
        setUploadErrors(result.errors);
        setUploading(false);
        setUploadSuccess(true);
        toast({
          title: "✅ File Processed Successfully",
          description: `${file.name} — ${result.imported} leads imported · ${result.flagged} flagged for duplicate review.`,
          duration: 5000,
        });
      })
      .catch((err: Error) => {
        // Cancel the animation so a failed upload doesn't show completed pipeline steps.
        animationTimeoutsRef.current.forEach(clearTimeout);
        animationTimeoutsRef.current = [];
        setUploading(false);
        setUploadSuccess(false);
        setActiveStep(0);
        toast({
          title: "❌ Upload Failed",
          description: err.message,
          variant: "destructive",
          duration: 5000,
        });
        // Allow user to try again
        setUploadedFile(null);
      });
  };

  const onManualSubmit = async (data: FormData) => {
    try {
      const result = await createLead({
        project_name: data.projectName,
        location: data.location,
        value_rm: Number(data.value),
        project_type: data.type || "Commercial",
        stage: data.stage || "Planning",
        developer: data.developer || null,
        floors: data.floors ? Number(data.floors) : null,
        gfa: data.gfa ? Number(data.gfa) : null,
      });
      toast({
        title: "✅ Lead Created & AI-Scored",
        description: `" ${data.projectName} " routed to ${result.ai_analysis?.top_match_bu ?? "AI"} (score: ${result.ai_analysis?.match_score ?? "—"}). Check Lead Workbench.`,
        duration: 6000,
      });
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "❌ Submission Failed",
        description: `Could not reach the AI backend. ${message}`,
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Data Ingestion
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Import BCI project data via CSV or PDF, or enter leads manually for AI scoring.
        </p>
      </div>

      {/* Pipeline Visualization */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-card">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">AI Processing Pipeline</p>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {PIPELINE_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = uploading && activeStep >= i;
            const isDone = uploadSuccess || (uploading && activeStep > i);
            return (
              <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300",
                  isDone ? "bg-success-light border-success/30 text-success" :
                  isActive ? "bg-primary-light border-primary/30 text-primary" :
                  "bg-muted border-border text-muted-foreground"
                )}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold whitespace-nowrap">{step.label}</p>
                    <p className="text-xs opacity-70 whitespace-nowrap">{step.desc}</p>
                  </div>
                  {isDone && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <ArrowRight className={cn("w-3.5 h-3.5 flex-shrink-0 mx-0.5 transition-colors", isDone ? "text-success" : "text-border")} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drag & Drop (Desktop only) */}
        <div className="hidden md:block">
          <div className="bg-card border border-border rounded-xl p-5 shadow-card h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-primary-light flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">BCI File Upload</h2>
                <p className="text-xs text-muted-foreground">CSV or PDF · Drag & drop or click to browse</p>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {!uploadedFile ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 flex-1 flex flex-col items-center justify-center min-h-[240px]",
                    dragOver
                      ? "border-primary bg-primary-light scale-[1.01]"
                      : "border-border hover:border-primary/50 hover:bg-muted/40"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 50 * 1024 * 1024) {
                        toast({ title: "File too large", description: "Please upload a file under 50\u00a0MB.", variant: "destructive" });
                        e.target.value = "";
                        return;
                      }
                      processFile(f);
                    }}
                  />
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all",
                    dragOver ? "bg-primary scale-110" : "bg-muted"
                  )}>
                    <Upload className={cn("w-7 h-7 transition-colors", dragOver ? "text-white" : "text-muted-foreground")} />
                  </div>
                  <p className="text-sm font-bold text-foreground mb-1">
                    {dragOver ? "Release to upload" : "Drag & drop your BCI export here"}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">CSV or PDF &middot; Max 50MB</p>
                  <Button variant="outline" size="sm" className="pointer-events-none">
                    Browse Files
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="uploaded"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "border-2 rounded-xl p-6 flex-1 flex flex-col items-center justify-center text-center min-h-[240px] transition-colors",
                    uploadSuccess ? "border-success/30 bg-success-light" : "border-primary/30 bg-primary-light"
                  )}
                >
                  {uploading ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                      <p className="text-sm font-bold text-foreground">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {uploadedFile.name.toLowerCase().endsWith(".pdf")
                          ? "GPT-4o reading PDF & scoring leads..."
                          : "Running AI scoring pipeline..."}
                      </p>
                      <div className="flex gap-1 mt-4">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl bg-success/20 flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-8 h-8 text-success" />
                      </div>
                      <p className="text-base font-black text-success">Upload Complete!</p>
                      <p className="text-sm font-semibold text-foreground mt-1">{uploadedFile.name}</p>
                      <div className="flex gap-4 mt-3">
                        <div className="text-center">
                          <p className="text-xl font-black text-success">{importedCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Leads imported</p>
                        </div>
                        <div className="w-px bg-border" />
                        <div className="text-center">
                          <p className="text-xl font-black text-destructive">{flaggedCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">Flagged</p>
                        </div>
                      </div>
                      {uploadErrors.length > 0 && (
                        <details className="mt-3 text-left w-full">
                          <summary className="text-xs text-warning cursor-pointer font-semibold">
                            {uploadErrors.length} row error{uploadErrors.length !== 1 ? 's' : ''}
                          </summary>
                          <ul className="mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
                            {uploadErrors.map((e, i) => (
                              <li key={i} className="text-xs text-muted-foreground">{e}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4 bg-card"
                        onClick={() => { animationTimeoutsRef.current.forEach(clearTimeout); animationTimeoutsRef.current = []; setUploadedFile(null); setUploadSuccess(false); setActiveStep(0); setImportedCount(null); setFlaggedCount(null); setUploadErrors([]); }}
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        Upload Another
                      </Button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Supported Format */}
            <div className="mt-4 p-3 bg-muted/50 rounded-xl border border-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-primary-light text-primary border border-primary/20 rounded px-1.5 py-0.5 font-semibold">CSV</span>
                <p className="text-xs font-semibold text-muted-foreground">Expected columns (case-insensitive):</p>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {["Project Name", "Location", "GDV", "Stage", "Developer", "GFA", "Type"].map((col) => (
                  <span key={col} className="text-xs bg-card border border-border rounded-md px-2 py-0.5 text-foreground font-mono">
                    {col}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded px-1.5 py-0.5 font-semibold">PDF</span>
                <p className="text-xs text-muted-foreground">GPT-4o auto-extracts all project leads from any BCI report PDF.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Manual Entry Form */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg bg-primary-light flex items-center justify-center">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Manual Lead Entry</h2>
              <p className="text-xs text-muted-foreground">AI will auto-score on submission</p>
            </div>
            <span className="md:hidden ml-auto flex items-center gap-1 text-xs text-info bg-info-light border border-info/20 rounded-full px-2 py-0.5 font-medium">
              <Smartphone className="w-3 h-3" />
              Mobile
            </span>
          </div>

          <form onSubmit={handleSubmit(onManualSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Project Name *</Label>
                <Input
                  placeholder="e.g. Avantro Residences Phase 3"
                  className="h-9 text-sm"
                  {...register("projectName", { required: true })}
                />
                {errors.projectName && <p className="text-xs text-destructive">Project name is required</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Location *</Label>
                <Input
                  placeholder="e.g. Mont Kiara, KL"
                  className="h-9 text-sm"
                  {...register("location", { required: true })}
                />
                {errors.location && <p className="text-xs text-destructive">Required</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">GDV / Value (RM) *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 50000000"
                  className="h-9 text-sm"
                  {...register("value", { required: true })}
                />
                {errors.value && <p className="text-xs text-destructive">Required</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Developer</Label>
                <Input
                  placeholder="e.g. Avantro Development Sdn Bhd"
                  className="h-9 text-sm"
                  {...register("developer")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Floors</Label>
                <Input
                  type="number"
                  placeholder="e.g. 42"
                  className="h-9 text-sm"
                  {...register("floors")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">GFA (sq ft)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 850000"
                  className="h-9 text-sm"
                  {...register("gfa")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Project Stage</Label>
                <select
                  className="w-full h-9 text-sm border border-input rounded-lg bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  {...register("stage")}
                >
                  <option value="">Select stage...</option>
                  <option value="Planning">Planning</option>
                  <option value="Tender">Tender</option>
                  <option value="Construction">Construction</option>
                </select>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Project Type</Label>
                <div className="flex flex-wrap bg-muted rounded-lg p-1 gap-0.5">
                  {[
                    { value: "High-Rise", label: "🏙️ High-Rise" },
                    { value: "Industrial", label: "🏭 Industrial" },
                    { value: "Commercial", label: "🏬 Commercial" },
                    { value: "Infrastructure", label: "🏗️ Infrastructure" },
                    { value: "Renovation", label: "🔨 Renovation" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex-1 min-w-[100px] cursor-pointer">
                      <input type="radio" value={opt.value} {...register("type")} className="sr-only peer" />
                      <span className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground rounded-md px-2.5 py-2 transition-all peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm peer-checked:border peer-checked:border-primary/30 hover:text-foreground">
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full gradient-primary text-white font-bold gap-2 h-10 mt-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scoring with AI...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add Lead & Run AI Scoring
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
