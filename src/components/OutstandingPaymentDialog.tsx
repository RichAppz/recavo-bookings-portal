import { BookingCheckout, type BookingContact } from "@/components/BookingCheckout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PublicBookingPayment } from "@/lib/api/hooks";

export function OutstandingPaymentDialog({
  title,
  payment,
  contact,
  onPaid,
  onOpenChange,
}: {
  title: string;
  payment: PublicBookingPayment | null;
  contact: BookingContact;
  onPaid: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={payment !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Card details are processed by Stripe.</DialogDescription>
        </DialogHeader>
        {payment ? <BookingCheckout payment={payment} contact={contact} onPaid={onPaid} /> : null}
      </DialogContent>
    </Dialog>
  );
}
