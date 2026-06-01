'use client'

import { useSkillStore, AVAILABLE_SKILLS, type AgentSkill } from '@/stores/skill-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Shield, Zap, FileCode, Terminal, Globe, Monitor, ToggleLeft, ToggleRight } from 'lucide-react'

const categoryConfig = {
  file: { label: 'File Operations', icon: FileCode, color: 'text-blue-400' },
  terminal: { label: 'Terminal & Commands', icon: Terminal, color: 'text-emerald-400' },
  web: { label: 'Web & Internet', icon: Globe, color: 'text-purple-400' },
  code: { label: 'Code Analysis', icon: FileCode, color: 'text-amber-400' },
  system: { label: 'System Access', icon: Monitor, color: 'text-rose-400' },
}

export function SkillsPanel() {
  const { skills, toggleSkill, enableAllSkills, disableAllSkills } = useSkillStore()

  const enabledCount = skills.filter((s) => s.enabled).length
  const categories = Object.keys(categoryConfig) as AgentSkill['category'][]

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="h-3 w-3" />
            Agent Skills
          </h3>
          <Badge variant="secondary" className="text-[10px] h-4">
            {enabledCount}/{skills.length} active
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 flex-1"
            onClick={enableAllSkills}
          >
            Enable All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 flex-1"
            onClick={disableAllSkills}
          >
            Disable All
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {categories.map((category) => {
            const config = categoryConfig[category]
            const categorySkills = skills.filter((s) => s.category === category)
            if (categorySkills.length === 0) return null

            const Icon = config.icon
            const enabledInCategory = categorySkills.filter((s) => s.enabled).length

            return (
              <Accordion key={category} type="single" collapsible defaultValue={category}>
                <AccordionItem value={category} className="border-0">
                  <AccordionTrigger className="hover:no-underline py-2 px-2 rounded hover:bg-accent/50">
                    <div className="flex items-center gap-2 flex-1 text-left">
                      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                      <span className="text-xs font-medium">{config.label}</span>
                      <Badge variant="outline" className="text-[9px] h-3.5 ml-auto mr-1">
                        {enabledInCategory}/{categorySkills.length}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pl-1">
                      {categorySkills.map((skill) => (
                        <SkillItem
                          key={skill.id}
                          skill={skill}
                          onToggle={() => toggleSkill(skill.id)}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )
          })}
        </div>
      </ScrollArea>

      {/* Security Info */}
      <div className="px-3 py-2 border-t bg-muted/30">
        <div className="flex items-start gap-1.5">
          <Shield className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Destructive operations (file write/delete, terminal exec) require confirmation before execution.
          </p>
        </div>
      </div>
    </div>
  )
}

function SkillItem({ skill, onToggle }: { skill: AgentSkill; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-accent/30 transition-colors">
      <span className="text-sm">{skill.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{skill.name}</span>
          {skill.requiresConfirmation && (
            <Badge variant="outline" className="text-[8px] h-3 px-1 text-amber-500 border-amber-500/30">
              CONFIRM
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{skill.description}</p>
      </div>
      <Switch
        checked={skill.enabled}
        onCheckedChange={onToggle}
        className="scale-75"
      />
    </div>
  )
}
