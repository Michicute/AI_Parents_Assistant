locals {
  name_prefix = "${var.project_name}-${var.environment}"

  labels = {
    project     = replace(lower(var.project_name), "_", "-")
    environment = replace(lower(var.environment), "_", "-")
    managed-by  = "terraform"
  }

  create_network    = var.network_name == ""
  create_subnetwork = var.subnetwork_name == ""

  app_allowed_ipv4_cidrs = [for cidr in var.app_allowed_cidrs : cidr if !strcontains(cidr, ":")]
  app_allowed_ipv6_cidrs = [for cidr in var.app_allowed_cidrs : cidr if strcontains(cidr, ":")]

  selected_network    = local.create_network ? google_compute_network.app[0].self_link : data.google_compute_network.selected[0].self_link
  selected_subnetwork = local.create_subnetwork ? google_compute_subnetwork.app[0].self_link : data.google_compute_subnetwork.selected[0].self_link
}

data "google_compute_network" "selected" {
  count = local.create_network ? 0 : 1
  name  = var.network_name
}

data "google_compute_subnetwork" "selected" {
  count  = local.create_subnetwork ? 0 : 1
  name   = var.subnetwork_name
  region = var.gcp_region
}

resource "google_compute_network" "app" {
  count                   = local.create_network ? 1 : 0
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "app" {
  count         = local.create_subnetwork ? 1 : 0
  name          = "${local.name_prefix}-subnet"
  ip_cidr_range = var.subnetwork_cidr
  region        = var.gcp_region
  network       = google_compute_network.app[0].id
}

resource "google_compute_firewall" "app_web_ipv4" {
  count   = length(local.app_allowed_ipv4_cidrs) > 0 ? 1 : 0
  name    = "${local.name_prefix}-web"
  network = local.selected_network

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = local.app_allowed_ipv4_cidrs
  target_tags   = ["${local.name_prefix}-app"]
}

resource "google_compute_firewall" "app_web_ipv6" {
  count   = length(local.app_allowed_ipv6_cidrs) > 0 ? 1 : 0
  name    = "${local.name_prefix}-web-ipv6"
  network = local.selected_network

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = local.app_allowed_ipv6_cidrs
  target_tags   = ["${local.name_prefix}-app"]
}

resource "google_compute_firewall" "app_ssh" {
  count   = length(var.ssh_allowed_cidrs) > 0 ? 1 : 0
  name    = "${local.name_prefix}-ssh"
  network = local.selected_network

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.ssh_allowed_cidrs
  target_tags   = ["${local.name_prefix}-app"]
}

resource "google_compute_address" "app" {
  count  = var.assign_static_ip ? 1 : 0
  name   = "${local.name_prefix}-ip"
  region = var.gcp_region
}

resource "google_compute_instance" "app" {
  name         = "${local.name_prefix}-app"
  machine_type = var.machine_type
  zone         = var.gcp_zone
  tags         = ["${local.name_prefix}-app"]
  labels       = local.labels

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = var.boot_disk_size_gb
      type  = var.boot_disk_type
    }
  }

  network_interface {
    network    = local.selected_network
    subnetwork = local.selected_subnetwork

    access_config {
      nat_ip = var.assign_static_ip ? google_compute_address.app[0].address : null
    }
  }

  metadata = {
    ssh-keys = "${var.ssh_username}:${var.ssh_public_key}"
  }

  metadata_startup_script = var.enable_docker_install_startup_script ? templatefile("${path.module}/startup.sh.tftpl", {
    app_directory = var.app_directory
    ssh_username  = var.ssh_username
  }) : null

  service_account {
    email  = var.vm_service_account_email != "" ? var.vm_service_account_email : null
    scopes = ["cloud-platform"]
  }
}
