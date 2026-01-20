import { useState, useEffect } from "react"
import { Eye, EyeOff, Loader2, Trash2, Plus, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { UserModel } from "@/types"

interface ModelConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1"

export function ModelConfigDialog({
  open,
  onOpenChange
}: ModelConfigDialogProps): React.JSX.Element {
  // API configuration state
  const [apiKey, setApiKeyInput] = useState("")
  const [baseUrl, setBaseUrlInput] = useState(DEFAULT_BASE_URL)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasExistingKey, setHasExistingKey] = useState(false)

  // Model management state
  const [newModelName, setNewModelName] = useState("")
  const [newModelId, setNewModelId] = useState("")
  const [newModelDesc, setNewModelDesc] = useState("")
  const [addingModel, setAddingModel] = useState(false)

  const { setApiKey, deleteApiKey, setBaseUrl, loadModels, models, addModel, deleteModel, setDefaultModel } =
    useAppStore()

  // Load existing configuration
  useEffect(() => {
    if (open) {
      loadExistingConfig()
    }
  }, [open])

  async function loadExistingConfig(): Promise<void> {
    const key = await window.api.models.getApiKey()
    const url = await window.api.models.getBaseUrl()
    setHasExistingKey(!!key)
    setApiKeyInput("")
    setBaseUrlInput(url || DEFAULT_BASE_URL)
    setShowKey(false)
    await loadModels()
  }

  async function handleSaveConfig(): Promise<void> {
    setSaving(true)
    try {
      if (apiKey.trim()) {
        await setApiKey(apiKey.trim())
      }
      await setBaseUrl(baseUrl.trim() || DEFAULT_BASE_URL)
      await loadModels()
      setApiKeyInput("")
      setHasExistingKey(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteKey(): Promise<void> {
    setSaving(true)
    try {
      await deleteApiKey()
      setHasExistingKey(false)
      await loadModels()
    } finally {
      setSaving(false)
    }
  }

  async function handleAddModel(): Promise<void> {
    if (!newModelName.trim() || !newModelId.trim()) return
    setAddingModel(true)
    try {
      const model: UserModel = {
        id: crypto.randomUUID(),
        name: newModelName.trim(),
        modelId: newModelId.trim(),
        description: newModelDesc.trim() || undefined,
        isDefault: models.length === 0 // First model becomes default
      }
      await addModel(model)
      setNewModelName("")
      setNewModelId("")
      setNewModelDesc("")
      await loadModels()
    } finally {
      setAddingModel(false)
    }
  }

  async function handleDeleteModel(modelId: string): Promise<void> {
    await deleteModel(modelId)
    await loadModels()
  }

  async function handleSetDefault(modelId: string): Promise<void> {
    await setDefaultModel(modelId)
    await loadModels()
  }

  // Get user models with isDefault info
  const [userModels, setUserModels] = useState<UserModel[]>([])
  useEffect(() => {
    if (open) {
      window.api.models.getUserModels().then(setUserModels)
    }
  }, [open, models])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Model Configuration</DialogTitle>
          <DialogDescription>
            Configure your OpenAI-compatible API endpoint and manage models.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="api" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api">API Settings</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="space-y-4 pt-4">
            {/* Base URL */}
            <div className="space-y-2">
              <Label>API Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder={DEFAULT_BASE_URL}
              />
              <p className="text-xs text-muted-foreground">
                Enter the base URL for your OpenAI-compatible API endpoint.
              </p>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={hasExistingKey ? "••••••••••••••••" : "sk-..."}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {hasExistingKey
                  ? "API key is configured. Enter a new key to replace it."
                  : "Enter your API key for the selected endpoint."}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex justify-between pt-2">
              {hasExistingKey && (
                <Button variant="destructive" size="sm" onClick={handleDeleteKey} disabled={saving}>
                  <Trash2 className="size-4 mr-1" />
                  Remove Key
                </Button>
              )}
              <div className="ml-auto">
                <Button onClick={handleSaveConfig} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="models" className="space-y-4 pt-4">
            {/* Add new model */}
            <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
              <div className="text-xs font-medium">Add New Model</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Display name"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  className="text-sm"
                />
                <Input
                  placeholder="Model ID (e.g., gpt-4o)"
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  className="text-sm"
                />
              </div>
              <Input
                placeholder="Description (optional)"
                value={newModelDesc}
                onChange={(e) => setNewModelDesc(e.target.value)}
                className="text-sm"
              />
              <Button
                size="sm"
                onClick={handleAddModel}
                disabled={!newModelName.trim() || !newModelId.trim() || addingModel}
                className="w-full"
              >
                {addingModel ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="size-4 mr-1" />
                    Add Model
                  </>
                )}
              </Button>
            </div>

            {/* Configured models list */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Configured Models ({userModels.length})
              </div>
              {userModels.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No models configured yet
                </p>
              ) : (
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {userModels.map((model) => (
                    <div
                      key={model.id}
                      className="flex items-center gap-2 p-2 rounded border bg-background"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{model.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {model.modelId}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSetDefault(model.id)}
                        className={cn(
                          "p-1 rounded transition-colors",
                          model.isDefault
                            ? "text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        title={model.isDefault ? "Default model" : "Set as default"}
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete model"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
