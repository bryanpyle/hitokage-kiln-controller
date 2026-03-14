import { createTheme } from "@mui/material/styles";

const kilnTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#ef6c00", // deep orange — kiln fire
    },
    secondary: {
      main: "#b0bec5",
    },
    background: {
      default: "#121212",
      paper: "#1e1e1e",
    },
    error: {
      main: "#f44336",
    },
    warning: {
      main: "#ffa726",
    },
    success: {
      main: "#66bb6a",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
  },
});

export default kilnTheme;
