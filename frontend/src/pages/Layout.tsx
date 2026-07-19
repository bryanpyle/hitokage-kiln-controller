import { Link, Outlet, useLocation } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import { useEffect, useState } from "react";
import { fetchConfig } from "../api/http";
import type { KilnConfig } from "../types";

declare const __APP_VERSION__: string;

export default function Layout() {
  const location = useLocation();
  const [kilnConfig, setKilnConfig] = useState<KilnConfig | null>(null);

  useEffect(() => {
    fetchConfig().then(setKilnConfig).catch(console.error);
  }, []);

  // Map pathname → tab index
  const tabValue = location.pathname.startsWith("/profiles") ? 1 : 0;

  return (
    <Box display="flex" flexDirection="column" minHeight="100vh">
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar>
          <WhatshotIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6" sx={{ flexGrow: 0, mr: 4, fontWeight: 700 }}>
            Hitokage Kiln
          </Typography>

          <Tabs value={tabValue} textColor="primary" indicatorColor="primary">
            <Tab label="Dashboard" component={Link} to="/" />
            <Tab label="Profiles" component={Link} to="/profiles" />
          </Tabs>

          <Box flexGrow={1} />

          {kilnConfig?.simulate && (
            <Chip label="SIMULATOR" size="small" color="warning" sx={{ fontWeight: 600 }} />
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3, flex: 1 }}>
        <Outlet />
      </Container>

      <Box
        component="footer"
        sx={{ py: 1, textAlign: "center", borderTop: 1, borderColor: "divider" }}
      >
        <Typography variant="caption" color="text.disabled">
          v{__APP_VERSION__}
        </Typography>
      </Box>
    </Box>
  );
}
