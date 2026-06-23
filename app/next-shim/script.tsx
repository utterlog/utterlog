import type { ScriptHTMLAttributes } from 'react';

type Props = ScriptHTMLAttributes<HTMLScriptElement> & {
  strategy?: string;
};

export default function Script({ strategy: _strategy, ...rest }: Props) {
  return <script {...rest} />;
}
