import React from 'react';
const MAX_PROMPT_LENGTH = 50_000;
type PromptProps = {
  promptText: string;
};
const Prompt = ({ promptText }: PromptProps) => {
  const safePromptText = (() => {
    if (typeof promptText !== 'string') return '';
    const stripped = promptText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (stripped.length > MAX_PROMPT_LENGTH) {
      return stripped.slice(0, MAX_PROMPT_LENGTH) + '\n\n[Content truncated for display]';
    }
    return stripped;
  })();
 
  return (
    <div className="card pb-2.5">
      <div className="card-header p-2" id="prompts">
        <h3 className="card-title text-md md:text-lg">Prompts</h3>
      </div>
 
      <div className="md:card-body p-2 grid gap-5">
        <div className="w-full">
          <div className="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
            <label className="form-label flex items-center gap-1 max-w-40 text-sm md:text-md">
              Prompts:<span className="text-danger text-xl">*</span>
            </label>
            <textarea
              className="textarea"
              placeholder="prompt"
              value={safePromptText}
              rows={22}
              readOnly
            />
          </div>
        </div>
      </div>
    </div>
  );
};
 
export default Prompt;
 
