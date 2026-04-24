import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Copy, MessageSquare, PartyPopper } from "lucide-react";

import SiteHeader from "@/components/SiteHeader";
import SiteOrbs from "@/components/SiteOrbs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const ADMIN_EMAIL = "yurieforlife@gmail.com";

type PurchaseTicket = {
  id: string;
  user_id: string;
  email: string;
  product_slug: string;
  product_name: string;
  tier: string;
  price: number;
  payment_method: string;
  status: "open" | "payment_received" | "completed" | "cancelled";
  license_key: string | null;
  created_at: string;
  completed_at: string | null;
};

type PurchaseMessage = {
  id: string;
  email: string;
  message: string;
  is_admin: boolean;
  created_at: string;
};

const generateLicenseKey = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = (length: number) =>
    Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  return `${chunk(5)}-${chunk(5)}-${chunk(5)}-${chunk(5)}`;
};

const confettiBurst = () => {
  const colors = ["#a855f7", "#ec4899", "#22d3ee", "#facc15", "#34d399"];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.style.position = "fixed";
    piece.style.left = "50%";
    piece.style.top = "20%";
    piece.style.width = "8px";
    piece.style.height = "12px";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.zIndex = "9999";
    piece.style.pointerEvents = "none";
    piece.style.borderRadius = "2px";
    piece.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`;
    piece.style.transition = "transform 1.4s ease-out, opacity 1.4s ease-out";

    document.body.appendChild(piece);

    requestAnimationFrame(() => {
      const x = (Math.random() - 0.5) * 700;
      const y = Math.random() * 500 + 100;
      piece.style.transform = `translate(${x}px, ${y}px) rotate(${Math.random() * 720}deg)`;
      piece.style.opacity = "0";
    });

    setTimeout(() => piece.remove(), 1600);
  }
};

const PurchaseTicketDetail = () => {
  const { ticketId } = useParams();
  const { user, loading } = useAuth();

  const [ticket, setTicket] = useState<PurchaseTicket | null>(null);
  const [messages, setMessages] = useState<PurchaseMessage[]>([]);
  const [message, setMessage] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [sending, setSending] = useState(false);
  const [completing, setCompleting] = useState(false);

  const isAdmin = user?.email === ADMIN_EMAIL;

  const fetchTicket = async () => {
    if (!ticketId || !user) return;

    setLoadingData(true);

    const { data: ticketData, error: ticketError } = await supabase
      .from("purchase_tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (ticketError) {
      setLoadingData(false);
      toast({
        title: "Failed to load purchase ticket",
        description: ticketError.message,
        variant: "destructive",
      });
      return;
    }

    const typedTicket = ticketData as PurchaseTicket;

    if (!isAdmin && typedTicket.user_id !== user.id) {
      setLoadingData(false);
      toast({
        title: "Access denied",
        description: "You cannot view this purchase ticket.",
        variant: "destructive",
      });
      return;
    }

    const { data: messageData, error: messageError } = await supabase
      .from("purchase_ticket_messages")
      .select("id, email, message, is_admin, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    setLoadingData(false);

    if (messageError) {
      toast({
        title: "Failed to load messages",
        description: messageError.message,
        variant: "destructive",
      });
      return;
    }

    setTicket(typedTicket);
    setMessages((messageData as PurchaseMessage[]) || []);
  };

  useEffect(() => {
    if (!loading && user && ticketId) {
      fetchTicket();
    }
  }, [loading, user, ticketId]);

  useEffect(() => {
    if (ticket?.status === "completed" && ticket.license_key && !isAdmin) {
      confettiBurst();
    }
  }, [ticket?.status, ticket?.license_key, isAdmin]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ticketId) return;

    if (!message.trim()) {
      toast({
        title: "Empty message",
        description: "Please type a message first.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    const { data, error } = await supabase.rpc("send_purchase_ticket_message", {
      input_ticket_id: ticketId,
      input_message: message.trim(),
    });

    setSending(false);

    if (error) {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (!data?.success) {
      toast({
        title: "Failed to send message",
        description: data?.message || "Unknown error",
        variant: "destructive",
      });
      return;
    }

    setMessage("");
    await fetchTicket();
  };

  const handleCopyKey = async () => {
    if (!ticket?.license_key) return;

    await navigator.clipboard.writeText(ticket.license_key);

    toast({
      title: "Copied",
      description: "License key copied to clipboard.",
    });
  };

  const handlePaymentReceived = async () => {
    if (!ticket || !isAdmin) return;

    const confirmed = window.confirm(
      `Mark payment received and generate a key for ${ticket.email}?`
    );

    if (!confirmed) return;

    setCompleting(true);

    const generatedKey = generateLicenseKey();

    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("slug", ticket.product_slug)
      .single();

    if (productError) {
      setCompleting(false);
      toast({
        title: "Failed to find product",
        description: productError.message,
        variant: "destructive",
      });
      return;
    }

    const durationDays =
      ticket.tier === "day" ? 1 : ticket.tier === "month" ? 30 : 36500;

    const { error: keyError } = await supabase.from("license_keys").insert({
      product_id: productData.id,
      license_key: generatedKey,
      duration_days: durationDays,
      status: "unused",
    });

    if (keyError) {
      setCompleting(false);
      toast({
        title: "Failed to create license key",
        description: keyError.message,
        variant: "destructive",
      });
      return;
    }

    const { error: ticketError } = await supabase
      .from("purchase_tickets")
      .update({
        status: "completed",
        license_key: generatedKey,
        completed_at: new Date().toISOString(),
      })
      .eq("id", ticket.id);

    if (ticketError) {
      setCompleting(false);
      toast({
        title: "Failed to complete ticket",
        description: ticketError.message,
        variant: "destructive",
      });
      return;
    }

    await supabase.rpc("send_purchase_ticket_message", {
      input_ticket_id: ticket.id,
      input_message: `Payment received. Your license key is: ${generatedKey}\n\nGo to the dashboard to activate it.`,
    });

    setCompleting(false);

    toast({
      title: "Payment marked received",
      description: "The user can now copy their license key.",
    });

    await fetchTicket();
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="relative min-h-screen">
      <SiteOrbs />
      <SiteHeader />

      <main className="relative mx-auto w-full max-w-[1000px] px-4 py-12 md:px-6">
        <Link
          to={isAdmin ? "/admin" : "/dashboard"}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        {!ticket ? (
          <div className="mt-6 rounded-3xl border border-border bg-gradient-panel p-8 shadow-elegant">
            <p className="text-muted-foreground">
              {loadingData ? "Loading purchase ticket..." : "Purchase ticket not found."}
            </p>
          </div>
        ) : (
          <>
            <section className="mt-6 rounded-3xl border border-border bg-gradient-panel p-6 shadow-elegant">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h1 className="text-3xl font-extrabold tracking-tight">
                    Purchase ticket
                  </h1>
                  <p className="mt-2 text-muted-foreground">
                    {ticket.product_name} · {ticket.tier} · ${ticket.price}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Payment method: {ticket.payment_method}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    User: {ticket.email}
                  </p>
                </div>

                <span className="rounded-full border border-border px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {ticket.status}
                </span>
              </div>

              {isAdmin && ticket.status !== "completed" ? (
                <Button
                  onClick={handlePaymentReceived}
                  disabled={completing}
                  className="mt-6 rounded-2xl bg-gradient-cta text-primary-foreground shadow-glow"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {completing ? "Completing..." : "Payment received + generate key"}
                </Button>
              ) : null}

              {!isAdmin && ticket.status === "completed" && ticket.license_key ? (
                <div className="mt-6 rounded-3xl border border-green-500/30 bg-green-500/10 p-6">
                  <div className="flex items-center gap-3">
                    <PartyPopper className="h-6 w-6 text-green-400" />
                    <h2 className="text-2xl font-extrabold">Payment received!</h2>
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">
                    Your license key is ready. Copy it and activate it in your dashboard.
                  </p>

                  <div className="mt-5 rounded-2xl border border-border bg-background/70 p-4 font-mono text-sm break-all">
                    {ticket.license_key}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Button onClick={handleCopyKey} className="rounded-2xl">
                      <Copy className="mr-2 h-4 w-4" />
                      Copy key
                    </Button>

                    <Button asChild variant="outline" className="rounded-2xl">
                      <Link to="/dashboard">Go to dashboard</Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="mt-6 rounded-3xl border border-border bg-gradient-panel p-6 shadow-elegant">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5" />
                <h2 className="text-2xl font-extrabold tracking-tight">
                  Conversation
                </h2>
              </div>

              <div className="mt-6 space-y-4">
                {messages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No messages yet.
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-2xl border p-4 ${
                        msg.is_admin
                          ? "border-purple-500/30 bg-purple-500/10"
                          : "border-border bg-card/50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold">
                          {msg.is_admin ? "Admin" : msg.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(msg.created_at).toLocaleString()}
                        </div>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/85">
                        {msg.message}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {ticket.status !== "completed" || isAdmin ? (
                <form className="mt-6 space-y-4" onSubmit={handleSendMessage}>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={isAdmin ? "Reply as admin..." : "Type your message..."}
                    className="min-h-[140px] w-full rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none"
                    disabled={sending}
                  />

                  <Button
                    type="submit"
                    disabled={sending}
                    className="h-12 rounded-2xl bg-gradient-cta px-6 text-primary-foreground shadow-glow"
                  >
                    {sending ? "Sending..." : "Send message"}
                  </Button>
                </form>
              ) : null}
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default PurchaseTicketDetail;
