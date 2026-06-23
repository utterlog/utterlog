
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white rounded-[8px] border border-gray-200', className)}>
      {children}
    </div>
  );
}

Card.Header = function CardHeader({ children, className }: CardProps) {
  return <div className={cn('px-6 py-4 border-b border-gray-200', className)}>{children}</div>;
};

Card.Body = function CardBody({ children, className }: CardProps) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
};

Card.Footer = function CardFooter({ children, className }: CardProps) {
  return <div className={cn('px-6 py-4 border-t border-gray-200', className)}>{children}</div>;
};
