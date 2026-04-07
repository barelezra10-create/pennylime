import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 min-h-[120px] bg-white rounded-[10px] border-transparent px-4 py-3.5 text-[15px] placeholder:text-[#a1a1aa] focus:ring-2 focus:ring-[#15803d] focus:border-transparent outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
