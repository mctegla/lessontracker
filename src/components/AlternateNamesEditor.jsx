import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function AlternateNamesEditor({ value, onChange }) {
  const [text, setText] = useState('');

  const add = () => {
    const v = text.trim();
    if (!v) return;
    if ((value || []).some((x) => x.toLowerCase() === v.toLowerCase())) { setText(''); return; }
    onChange([...(value || []), v]);
    setText('');
  };
  const remove = (i) => onChange((value || []).filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="e.g. Riding Lesson (private)"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="w-4 h-4" /></Button>
      </div>
      {(value || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((name, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
              {name}
              <button type="button" onClick={() => remove(i)} className="opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}