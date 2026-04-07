import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 bg-white rounded-[10px] border-transparent px-4 py-3.5 text-[15px] placeholder:text-[#a1a1aa] focus:ring-2 focus:ring-[#15803d] focus:border-transparent outline-none transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
