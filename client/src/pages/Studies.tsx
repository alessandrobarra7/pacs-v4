import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, FileText, Calendar } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Studies() {
  const [filters, setFilters] = useState({
    patient_name: "",
    modality: "",
    study_date: "",
    accession_number: "",
    page: 1,
    pageSize: 20,
  });

  const { data: studiesData, isLoading } = trpc.studies.list.useQuery(filters);

  const handleSearch = () => {
    setFilters({ ...filters, page: 1 });
  };

  // Viewer navigation handled by Link component

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-8 w-8" />
            Estudos DICOM
          </h1>
          <p className="text-muted-foreground mt-2">
            Busque e visualize estudos radiológicos
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filtros de Busca</CardTitle>
            <CardDescription>
              Use os filtros abaixo para refinar sua busca
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label htmlFor="patient_name">Nome do Paciente</Label>
                <Input
                  id="patient_name"
                  placeholder="Digite o nome..."
                  value={filters.patient_name}
                  onChange={(e) => setFilters({ ...filters, patient_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="modality">Modalidade</Label>
                <Input
                  id="modality"
                  placeholder="CT, MR, US..."
                  value={filters.modality}
                  onChange={(e) => setFilters({ ...filters, modality: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="study_date">Data do Estudo</Label>
                <Input
                  id="study_date"
                  type="date"
                  value={filters.study_date}
                  onChange={(e) => setFilters({ ...filters, study_date: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accession_number">Número de Acesso</Label>
                <Input
                  id="accession_number"
                  placeholder="Accession..."
                  value={filters.accession_number}
                  onChange={(e) => setFilters({ ...filters, accession_number: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={handleSearch} className="w-full md:w-auto">
                <Search className="mr-2 h-4 w-4" />
                Buscar Estudos
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle>Resultados da Busca</CardTitle>
            <CardDescription>
              {studiesData?.total || 0} estudo(s) encontrado(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                Carregando estudos...
              </div>
            ) : studiesData && studiesData.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>ID do Paciente</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Modalidade</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {studiesData.items.map((study: any) => (
                    <TableRow key={study.id}>
                      <TableCell className="font-medium">
                        {study.patient_name || "Não informado"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {study.patient_id || "-"}
                      </TableCell>
                      <TableCell>
                        {study.study_date ? new Date(study.study_date).toLocaleDateString('pt-BR') : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{study.modality || "N/A"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {study.description || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">Sem laudo</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/viewer/${study.id}`}>
                            <Button variant="ghost" size="sm" title="Abrir Visualizador DICOM">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/reports/${study.id}`}>
                            <Button variant="ghost" size="sm" title="Criar/Editar Laudo">
                              <FileText className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum estudo encontrado</p>
                <p className="text-sm mt-2">
                  Ajuste os filtros ou aguarde a sincronização com o Orthanc
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
