import { useState, useEffect } from "react"
import { ChevronDown, Check, Plus, Settings } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/lib/store"
import { useCurrentThread } from "@/lib/thread-context"
import { cn } from "@/lib/utils"
import { ModelConfigDialog } from "./ModelConfigDialog"

interface ModelSwitcherProps {
  threadId: string
}

export function ModelSwitcher({ threadId }: ModelSwitcherProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)

  const { models, hasApiKey, loadModels } = useAppStore()
  const { currentModel, setCurrentModel } = useCurrentThread(threadId)

  useEffect(() => {
    loadModels()
  }, [loadModels])

  const selectedModel = models.find((m) => m.id === currentModel)

  function handleModelSelect(modelId: string): void {
    setCurrentModel(modelId)
    setOpen(false)
  }

  function handleConfigDialogClose(isOpen: boolean): void {
    setConfigDialogOpen(isOpen)
    if (!isOpen) {
      // Refresh models after dialog closes
      loadModels()
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {selectedModel ? (
              <span className="font-mono">{selectedModel.name}</span>
            ) : (
              <span>Select model</span>
            )}
            <ChevronDown className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0 bg-background border-border" align="start" sideOffset={8}>
          {!hasApiKey ? (
            // No API key configured
            <div className="flex flex-col items-center justify-center p-4 text-center">
              <p className="text-xs text-muted-foreground mb-3">
                Please configure your API key first
              </p>
              <Button size="sm" onClick={() => setConfigDialogOpen(true)}>
                Configure API
              </Button>
            </div>
          ) : models.length === 0 ? (
            // No models configured
            <div className="flex flex-col items-center justify-center p-4 text-center">
              <p className="text-xs text-muted-foreground mb-3">No models configured</p>
              <Button size="sm" onClick={() => setConfigDialogOpen(true)}>
                <Plus className="size-4 mr-1" />
                Add Model
              </Button>
            </div>
          ) : (
            // Model list
            <div className="p-2">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1.5">
                Models
              </div>
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => handleModelSelect(model.id)}
                    className={cn(
                      "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-sm text-xs transition-colors text-left",
                      currentModel === model.id
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{model.name}</div>
                      {model.description && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {model.description}
                        </div>
                      )}
                    </div>
                    {currentModel === model.id && <Check className="size-3.5 shrink-0" />}
                  </button>
                ))}
              </div>

              {/* Settings button at bottom */}
              <div className="border-t border-border mt-2 pt-2">
                <button
                  onClick={() => setConfigDialogOpen(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Settings className="size-3.5" />
                  <span>Model Settings</span>
                </button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ModelConfigDialog open={configDialogOpen} onOpenChange={handleConfigDialogClose} />
    </>
  )
}
