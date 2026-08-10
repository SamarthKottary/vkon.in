import { ProtectionIcon, protectionMeta } from "@/components/icons/protections";
import type { ProtectionKey } from "@/lib/types";

/**
 * Protection list.
 *
 * Previously icon-in-a-rounded-chip cards, which was the most template-looking
 * block on the site. Now a ruled two-column list: small inline icon, name, one
 * line of explanation. The information is identical and it reads as reference
 * material rather than a feature grid.
 */
export function ProtectionList({ keys }: { keys: ProtectionKey[] }) {
  if (keys.length === 0) return null;

  return (
    <ul className="grid border-t border-line sm:grid-cols-2">
      {keys.map((key) => (
        <li
          key={key}
          className="flex gap-4 border-b border-line py-5 sm:odd:pr-8 sm:even:pl-8 sm:even:border-l"
        >
          <ProtectionIcon
            name={key}
            className="mt-0.5 h-5 w-5 shrink-0 text-accent"
          />
          <div>
            <h3 className="text-[0.9375rem] font-medium">
              {protectionMeta[key].label}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {protectionMeta[key].description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
