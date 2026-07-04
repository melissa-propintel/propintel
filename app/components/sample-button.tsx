// Opens a real, generated Property Intelligence Report as the sample.
// Swap public/sample-report.pdf to change what prospects see.
export function SampleButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href="/sample-report.pdf" target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
