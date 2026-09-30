export type EstadoReserva = "Pendiente" | "Enviado";

export type Reservation = {
  id: string;
  creadoEn: string;
  email: string;
  nombreVisitante: string;
  placa: string;
  tipoVehiculo: string;
  parqueadero: string;
  dia: string; // YYYY-MM-DD
  horaEntrada: string; // HH:MM
  horaSalida: string; // HH:MM
  duracionHoras: string; // formatted number as string, ej "2.5"
  estado: EstadoReserva;
  enviadoEn: string;
};

export type NewReservationInput = {
  email: string;
  nombreVisitante: string;
  placa: string;
  tipoVehiculo: string;
  parqueadero: string;
  dia: string;
  horaEntrada: string;
  horaSalida: string;
};