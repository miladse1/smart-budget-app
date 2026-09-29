import { Compass } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";

export function NotFoundPage() {
  usePageTitle("Page not found");
  return (
    <Card>
      <EmptyState icon={Compass} title="This page does not exist" action={<ButtonLink to="/">Back to Home</ButtonLink>}>
        The link may be out of date. Your budgets and transactions are unaffected.
      </EmptyState>
    </Card>
  );
}
