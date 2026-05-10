import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, FileText, Users, Building2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: units } = trpc.units.list.useQuery();

  const stats = [
    {
      title: "Total de Estudos",
      value: "0",
      description: "Estudos DICOM cadastrados",
      icon: Activity,
      trend: "+0%",
    },
    {
      title: "Laudos Pendentes",
      value: "0",
      description: "Aguardando assinatura",
      icon: FileText,
      trend: "0 hoje",
    },
    {
      title: "Unidades Ativas",
      value: units?.length || 0,
      description: "Unidades médicas",
      icon: Building2,
      trend: `${units?.filter(u => u.isActive).length || 0} ativas`,
    },
    {
      title: "Usuários",
      value: "1",
      description: "Usuários cadastrados",
      icon: Users,
      trend: "1 admin",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Dashboard PACS
          </h1>
          <p className="text-muted-foreground mt-2">
            Bem-vindo, {user?.name || user?.email}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.description}
                  </p>
                  <p className="text-xs text-primary mt-2 font-medium">
                    {stat.trend}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
            <CardDescription>
              Acesse rapidamente as principais funcionalidades
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Link href="/">
                <Button variant="outline" className="w-full justify-start h-auto py-4">
                  <Activity className="mr-2 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-semibold">Estudos DICOM</div>
                    <div className="text-xs text-muted-foreground">
                      Visualizar e buscar estudos
                    </div>
                  </div>
                </Button>
              </Link>

              <Link href="/templates">
                <Button variant="outline" className="w-full justify-start h-auto py-4">
                  <FileText className="mr-2 h-5 w-5" />
                  <div className="text-left">
                    <div className="font-semibold">Templates de Laudos</div>
                    <div className="text-xs text-muted-foreground">
                      Gerenciar templates
                    </div>
                  </div>
                </Button>
              </Link>

              {user?.role === 'admin_master' && (
                <Link href="/units">
                  <Button variant="outline" className="w-full justify-start h-auto py-4">
                    <Building2 className="mr-2 h-5 w-5" />
                    <div className="text-left">
                      <div className="font-semibold">Unidades Médicas</div>
                      <div className="text-xs text-muted-foreground">
                        Gerenciar unidades
                      </div>
                    </div>
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Atividades Recentes</CardTitle>
            <CardDescription>
              Últimas ações no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhuma atividade recente
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
