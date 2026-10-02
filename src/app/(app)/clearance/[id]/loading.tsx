import { PageLoader } from "@/components/shared/page-loader";

// Shaped like a record page so the header and tabs don't jump when the data arrives.
export default function Loading() {
  return <PageLoader variant="detail" />;
}
