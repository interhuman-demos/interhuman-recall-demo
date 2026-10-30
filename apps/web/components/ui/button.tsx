import { Button as ButtonPrimitive } from "@base-ui-components/react/button";
import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow,filter,transform] duration-150 ease-[var(--ease-out)] will-change-transform  active:scale-[0.97] active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 transition-transform will-change-transform  40ms",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        gradient:
          "text-white font-regular bg-[linear-gradient(180deg,var(--color-primary-gradient-start),var(--color-primary-gradient-end))] shadow-[var(--shadow-button-inset)] hover:brightness-110",
        brand:
          "bg-[var(--color-brand)] text-white font-regular hover:brightness-105",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90",
        link: "text-[var(--color-brand)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-4 py-2",
        xs: "h-6 gap-1 px-2 text-xs",
        sm: "h-8 gap-1 px-3",
        lg: "h-10 gap-1.5 px-6",
        xl: "gap-2 px-8 py-4 text-base",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-6",
        "icon-lg": "size-10",
      },
      pill: {
        true: "rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  pill,
  ...props
}: React.ComponentProps<typeof ButtonPrimitive> &
  VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, pill, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
