'use client'

import { useState, useCallback } from 'react'
import { useProviderStore, PRESET_PROVIDERS, type ProviderConfig, type ApiFormat } from '@/stores/provider-store'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Settings,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Server,
  Key,
  Globe,
  Zap,
  ExternalLink,
} from 'lucide-react'

export function SettingsDialog() {
  const { providers, activeProviderId, addProvider, updateProvider, removeProvider, setActiveProvider } =
    useProviderStore()
  const [open, setOpen] = useState(false)
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({})
  const [newProvider, setNewProvider] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    models: '',
    apiFormat: 'openai' as ApiFormat,
  })
  const [showNewProvider, setShowNewProvider] = useState(false)

  const toggleApiKeyVisibility = useCallback((id: string) => {
    setShowApiKeys((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleAddCustomProvider = useCallback(() => {
    if (!newProvider.name || !newProvider.baseUrl) return
    addProvider({
      name: newProvider.name,
      baseUrl: newProvider.baseUrl,
      apiKey: newProvider.apiKey,
      models: newProvider.models.split(',').map((m) => m.trim()).filter(Boolean),
      isActive: false,
      icon: '🔌',
      type: 'custom',
      apiFormat: newProvider.apiFormat,
    })
    setNewProvider({ name: '', baseUrl: '', apiKey: '', models: '', apiFormat: 'openai' })
    setShowNewProvider(false)
  }, [newProvider, addProvider])

  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({})

  const handleTestConnection = useCallback(async (provider: ProviderConfig) => {
    if (!provider.baseUrl || !provider.apiKey) return false
    try {
      const baseUrl = provider.baseUrl.replace(/\/$/, '')
      const apiFormat = provider.apiFormat || 'openai'

      if (apiFormat === 'anthropic') {
        // Test Anthropic-compatible endpoint
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
          ...provider.headers,
        }
        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: provider.models[0] || 'claude-sonnet-4-20250514',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
          signal: AbortSignal.timeout(15000),
        })
        return res.ok || res.status === 400 // 400 might mean model issue but connection works
      } else {
        // Test OpenAI-compatible endpoint
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
          ...provider.headers,
        }
        if (provider.name.toLowerCase().includes('openrouter')) {
          headers['HTTP-Referer'] = 'https://zcode.dev'
          headers['X-Title'] = 'ZCode'
        }
        const res = await fetch(`${baseUrl}/models`, { headers, signal: AbortSignal.timeout(10000) })
        return res.ok
      }
    } catch {
      return false
    }
  }, [])

  const onTest = useCallback(
    async (provider: ProviderConfig) => {
      setTestingId(provider.id)
      setTestResults((prev) => ({ ...prev, [provider.id]: null }))
      const result = await handleTestConnection(provider)
      setTestResults((prev) => ({ ...prev, [provider.id]: result ?? false }))
      setTestingId(null)
    },
    [handleTestConnection]
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Settings — API Providers
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          <div className="space-y-6">
            {/* FCC Proxy Notice */}
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-emerald-600 dark:text-emerald-400">
                  <p className="font-semibold mb-1">Free Claude Code Proxy</p>
                  <p className="mb-2">
                    Use the <strong>Free Claude Code (FCC)</strong> proxy to access 17+ providers for free. Install it:
                  </p>
                  <code className="block bg-black/30 px-2 py-1 rounded text-[11px] mb-2 font-mono">
                    curl -fsSL &quot;https://github.com/Alishahryar1/free-claude-code/blob/main/scripts/install.sh?raw=1&quot; | sh
                  </code>
                  <p className="mb-1">Then start the proxy:</p>
                  <code className="block bg-black/30 px-2 py-1 rounded text-[11px] mb-2 font-mono">
                    fcc-server
                  </code>
                  <p>
                    Open Admin UI at <code className="bg-black/30 px-1 rounded">http://localhost:8082/admin</code>, set your API key, and select FCC Proxy in ZCode.
                  </p>
                  <a
                    href="https://github.com/Alishahryar1/free-claude-code"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 text-emerald-500 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View on GitHub
                  </a>
                </div>
              </div>
            </div>

            {/* Provider Configuration */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Server className="h-4 w-4" />
                API Providers
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Configure your AI model providers. Supports OpenAI and Anthropic API formats.
              </p>

              <Accordion type="multiple" defaultValue={['builtin-zcode']} className="space-y-2">
                {providers.map((provider) => (
                  <AccordionItem
                    key={provider.id}
                    value={provider.id}
                    className="border rounded-lg px-4"
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-2 flex-1 text-left">
                        <span className="text-lg">{provider.icon || '🔌'}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{provider.name}</span>
                            {provider.id === activeProviderId && (
                              <Badge variant="default" className="text-[10px] h-4">
                                Active
                              </Badge>
                            )}
                            {provider.type === 'builtin' && (
                              <Badge variant="secondary" className="text-[10px] h-4">
                                Built-in
                              </Badge>
                            )}
                            {provider.apiKey && provider.type !== 'builtin' && (
                              <Badge variant="outline" className="text-[10px] h-4 text-emerald-500">
                                <Key className="h-2.5 w-2.5 mr-0.5" />
                                Key set
                              </Badge>
                            )}
                            {provider.apiFormat && provider.apiFormat !== 'builtin' && provider.type !== 'builtin' && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] h-4 ${
                                  provider.apiFormat === 'anthropic' ? 'text-amber-500 border-amber-500/30' : 'text-blue-500 border-blue-500/30'
                                }`}
                              >
                                {provider.apiFormat === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {provider.models.length} model{provider.models.length !== 1 ? 's' : ''}
                            {provider.baseUrl && ` · ${provider.baseUrl}`}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pb-3 pt-1">
                        {provider.type !== 'builtin' && (
                          <>
                            {/* Base URL */}
                            <div className="space-y-1.5">
                              <Label className="text-xs flex items-center gap-1">
                                <Globe className="h-3 w-3" />
                                Base URL
                              </Label>
                              <Input
                                value={provider.baseUrl}
                                onChange={(e) =>
                                  updateProvider(provider.id, { baseUrl: e.target.value })
                                }
                                placeholder="https://api.example.com/v1"
                                className="h-8 text-xs"
                              />
                            </div>

                            {/* API Key */}
                            <div className="space-y-1.5">
                              <Label className="text-xs flex items-center gap-1">
                                <Key className="h-3 w-3" />
                                API Key
                              </Label>
                              <div className="flex gap-2">
                                <Input
                                  type={showApiKeys[provider.id] ? 'text' : 'password'}
                                  value={provider.apiKey}
                                  onChange={(e) =>
                                    updateProvider(provider.id, { apiKey: e.target.value })
                                  }
                                  placeholder="sk-... or your API key"
                                  className="h-8 text-xs flex-1"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 flex-shrink-0"
                                  onClick={() => toggleApiKeyVisibility(provider.id)}
                                >
                                  {showApiKeys[provider.id] ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>

                            {/* API Format */}
                            <div className="space-y-1.5">
                              <Label className="text-xs">API Format</Label>
                              <Select
                                value={provider.apiFormat || 'openai'}
                                onValueChange={(val: ApiFormat) =>
                                  updateProvider(provider.id, { apiFormat: val })
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="openai">
                                    OpenAI (Chat Completions /v1/chat/completions)
                                  </SelectItem>
                                  <SelectItem value="anthropic">
                                    Anthropic (Messages /v1/messages)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-[10px] text-muted-foreground">
                                {provider.apiFormat === 'anthropic'
                                  ? 'Uses Anthropic Messages API format. For FCC proxy, Anthropic direct, Wafer, Kimi, Fireworks, Z.ai.'
                                  : 'Uses OpenAI Chat Completions format. Works with most providers.'}
                              </p>
                            </div>

                            {/* Models */}
                            <div className="space-y-1.5">
                              <Label className="text-xs">Models (comma-separated)</Label>
                              <Input
                                value={provider.models.join(', ')}
                                onChange={(e) =>
                                  updateProvider(provider.id, {
                                    models: e.target.value
                                      .split(',')
                                      .map((m) => m.trim())
                                      .filter(Boolean),
                                  })
                                }
                                placeholder="model-1, model-2"
                                className="h-8 text-xs"
                              />
                            </div>
                          </>
                        )}

                        {/* Models list for builtin */}
                        {provider.type === 'builtin' && (
                          <div className="flex flex-wrap gap-1.5">
                            {provider.models.map((model) => (
                              <Badge key={model} variant="secondary" className="text-xs">
                                {model}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          {provider.type !== 'builtin' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => onTest(provider)}
                                disabled={testingId === provider.id || !provider.apiKey}
                              >
                                {testingId === provider.id ? (
                                  'Testing...'
                                ) : testResults[provider.id] === true ? (
                                  <>
                                    <Check className="h-3 w-3 mr-1 text-emerald-500" />
                                    Connected
                                  </>
                                ) : testResults[provider.id] === false ? (
                                  <>
                                    <AlertCircle className="h-3 w-3 mr-1 text-red-500" />
                                    Failed
                                  </>
                                ) : (
                                  'Test Connection'
                                )}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => removeProvider(provider.id)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Remove
                              </Button>
                            </>
                          )}
                          {provider.id !== activeProviderId && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-xs ml-auto"
                              onClick={() => setActiveProvider(provider.id)}
                              disabled={provider.type !== 'builtin' && !provider.apiKey}
                            >
                              Set Active
                            </Button>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {/* Add Custom Provider */}
              <div className="mt-4">
                {showNewProvider ? (
                  <div className="border rounded-lg p-4 space-y-3">
                    <h4 className="text-xs font-semibold">Add Custom Provider</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Provider Name</Label>
                        <Input
                          value={newProvider.name}
                          onChange={(e) => setNewProvider((p) => ({ ...p, name: e.target.value }))}
                          placeholder="My Provider"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Base URL</Label>
                        <Input
                          value={newProvider.baseUrl}
                          onChange={(e) => setNewProvider((p) => ({ ...p, baseUrl: e.target.value }))}
                          placeholder="https://api.example.com/v1"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">API Key</Label>
                        <Input
                          type="password"
                          value={newProvider.apiKey}
                          onChange={(e) => setNewProvider((p) => ({ ...p, apiKey: e.target.value }))}
                          placeholder="Your API key"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">API Format</Label>
                        <Select
                          value={newProvider.apiFormat}
                          onValueChange={(val: ApiFormat) => setNewProvider((p) => ({ ...p, apiFormat: val }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="openai">OpenAI Compat</SelectItem>
                            <SelectItem value="anthropic">Anthropic Messages</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Models (comma-separated)</Label>
                      <Input
                        value={newProvider.models}
                        onChange={(e) => setNewProvider((p) => ({ ...p, models: e.target.value }))}
                        placeholder="model-1, model-2, model-3"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleAddCustomProvider}
                        disabled={!newProvider.name || !newProvider.baseUrl}
                      >
                        Add Provider
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowNewProvider(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs w-full"
                    onClick={() => setShowNewProvider(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Custom Provider
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Quick Add Presets */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Quick Add Presets</h3>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_PROVIDERS.filter((p) => p.type === 'custom').map((preset, i) => {
                  const existing = providers.find(
                    (p) => p.name === preset.name
                  )
                  return (
                    <button
                      key={i}
                      className="flex items-center gap-2 p-2.5 rounded-lg border bg-card hover:bg-accent transition-colors text-left disabled:opacity-50"
                      disabled={!!existing}
                      onClick={() => {
                        addProvider({
                          name: preset.name,
                          baseUrl: preset.baseUrl,
                          apiKey: '',
                          models: preset.models,
                          isActive: false,
                          icon: preset.icon,
                          type: 'custom',
                          headers: preset.headers,
                          apiFormat: preset.apiFormat,
                          description: preset.description,
                        })
                      }}
                    >
                      <span className="text-base">{preset.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{preset.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {existing ? '✓ Added' : preset.description || `${preset.models.length} models`}
                        </div>
                      </div>
                      {preset.apiFormat === 'anthropic' && (
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 text-amber-500 border-amber-500/30">
                          A
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Security Notice */}
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  <p className="font-semibold mb-1">Security Notice</p>
                  <p>
                    API keys are stored in your browser&apos;s localStorage and encoded (not encrypted).
                    They are only sent to the configured provider&apos;s API endpoint.
                    Never share your API keys or use this on a shared/public computer.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
